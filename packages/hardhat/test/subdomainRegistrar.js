const fs = require('fs')
const chalk = require('chalk')
const { config, ethers } = require('hardhat')
const { utils } = ethers
const { use, expect } = require('chai')
const { solidity } = require('ethereum-waffle')
const n = require('eth-ens-namehash')
const namehash = n.hash

use(solidity)

const addresses = {}

const NO_AUTO_DEPLOY = [
  'PublicResolver.sol',
  'SubdomainRegistrar.sol',
  'RestrictedNameWrapper.sol',
]

function readArgumentsFile(contractName) {
  let args = []
  try {
    const argsFile = `./contracts/${contractName}.args`
    if (fs.existsSync(argsFile)) {
      args = JSON.parse(fs.readFileSync(argsFile))
    }
  } catch (e) {
    console.log(e)
  }

  return args
}

const isSolidity = (fileName) =>
  fileName.indexOf('.sol') >= 0 && fileName.indexOf('.swp.') < 0

async function autoDeploy() {
  const contractList = fs.readdirSync(config.paths.sources)
  return contractList
    .filter((fileName) => {
      if (NO_AUTO_DEPLOY.includes(fileName)) {
        //don't auto deploy this list of Solidity files
        return false
      }
      return isSolidity(fileName)
    })
    .reduce((lastDeployment, fileName) => {
      const contractName = fileName.replace('.sol', '')
      const args = readArgumentsFile(contractName)

      // Wait for last deployment to complete before starting the next
      return lastDeployment.then((resultArrSoFar) =>
        deploy(contractName, args).then((result) => [...resultArrSoFar, result])
      )
    }, Promise.resolve([]))
}

async function deploy(name, _args) {
  const args = _args || []

  console.log(`📄 ${name}`)
  const contractArtifacts = await ethers.getContractFactory(name)
  const contract = await contractArtifacts.deploy(...args)
  console.log(chalk.cyan(name), 'deployed to:', chalk.magenta(contract.address))
  fs.writeFileSync(`artifacts/${name}.address`, contract.address)
  console.log('\n')
  contract.name = name
  addresses[name] = contract.address
  return contract
}

describe('My Dapp', function () {
  let myContract

  describe('YourContract', function () {
    it('Should deploy ENS contracts', async function () {
      console.log('📡 Deploy \n')
      // auto deploy to read contract directory and deploy them all (add ".args" files for arguments)
      const contractList = await autoDeploy()
      console.log('finish auto deploy')

      //console.log('contractList', contractList)
      const EnsRegistry = contractList.find(
        (contract) => contract.name === 'ENSRegistry'
      )
      const ROOT_NODE =
        '0x0000000000000000000000000000000000000000000000000000000000000000'

      const rootOwner = await EnsRegistry.owner(ROOT_NODE)
      const [owner, addr1] = await ethers.getSigners()
      const account = await owner.getAddress()

      const RestrictedNameWrapper = await deploy('RestrictedNameWrapper', [
        EnsRegistry.address,
      ])
      const PublicResolver = await deploy('PublicResolver', [
        addresses['ENSRegistry'],
        addresses['RestrictedNameWrapper'],
      ])

      const SubDomainRegistrar = await deploy('SubdomainRegistrar', [
        addresses['ENSRegistry'],
        addresses['RestrictedNameWrapper'],
      ])

      // setup .eth
      await EnsRegistry.setSubnodeOwner(
        ROOT_NODE,
        utils.keccak256(utils.toUtf8Bytes('eth')),
        account
      )

      // setup ens.eth
      await EnsRegistry.setSubnodeOwner(
        namehash('eth'),
        utils.keccak256(utils.toUtf8Bytes('ens')),
        account
      )

      const ethOwner = await EnsRegistry.owner(namehash('eth'))
      const ensEthOwner = await EnsRegistry.owner(namehash('ens.eth'))

      console.log('ethOwner', ethOwner)
      console.log('ensEthOwner', ensEthOwner)

      // console.log(
      //   'ens.setApprovalForAll RestrictedNameWrapper',
      //   account,
      //   addresses['RestrictedNameWrapper']
      // )
      // // make wrapper approved for account owning ens.eth
      // await EnsRegistry.setApprovalForAll(addresses['RestrictedNameWrapper'], true)

      console.log(
        'ens.setApprovalForAll SubDomainRegistrar',
        SubDomainRegistrar.address,
        true
      )
      await EnsRegistry.setApprovalForAll(SubDomainRegistrar.address, true)
      console.log(
        'RestrictedNameWrapper.setApprovalForAll SubDomainRegistrar',
        SubDomainRegistrar.address,
        true
      )
      await RestrictedNameWrapper.setApprovalForAll(
        SubDomainRegistrar.address,
        true
      )
    })

    describe('setPurpose()', function () {
      it('Should be able to set a new purpose', async function () {
        const newPurpose = 'Test Purpose'

        await myContract.setPurpose(newPurpose)
        expect(await myContract.purpose()).to.equal(newPurpose)
      })
    })
  })
})
