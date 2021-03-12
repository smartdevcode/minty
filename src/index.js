#!/usr/bin/env node

// This file contains the main entry point for the command line `minty` app, and the command line option parsing code.
// See minty.js for the core functionality.

const fs = require('fs/promises')
const {Command} = require('commander')
const config = require('getconfig')
const {MakeMinty} = require('./minty')
const {deployContract, saveDeploymentInfo} = require('./deploy')

async function main() {
    const program = new Command()

    // commands
    program
        .command('create-nft <image-path>')
        .description('Create a new NFT from an image file')
        .option('-n, --name <name>', 'The name of the NFT')
        .option('-d, --description <desc>', 'A description of the NFT')
        .option('-o, --owner <address>', 'The ethereum address that should own the NFT.' +
            'If not provided, defaults to the first signing address.')
        .action(createNFT)

    program.command('get-nft <token-id>')
        .description('Get info about an NFT using its token ID')
        .option('-c, --creation-info', 'include the creator address and block number the NFT was minted')
        .action(getNFT)

    program.command('pin-nft <token-id>')
        .description('"Pin" the data for an NFT to a remote IPFS Pinning Service')
        .action(pinNFTData)

    program.command('deploy')
        .description('deploy an instance of the Minty NFT contract')
        .option('-o, --output <deploy-file-path>', 'Path to write deployment info to', config.deploymentConfigFile || 'minty-deployment.json')
        .option('-n, --name <name>', 'The name of the token contract', 'Julep')
        .option('-s, --symbol <symbol>', 'A short symbol for the tokens in this contract', 'JLP')
        .action(deploy)

    await program.parseAsync(process.argv)
}

// ---- command action functions

async function createNFT(imagePath, options) {
    const minty = await MakeMinty()

    const nft = await minty.createNFTFromAssetFile(imagePath, options)
    console.log('Minted new NFT: ', nft)
}

async function getNFT(tokenId, options) {
    const { creationInfo: fetchCreationInfo } = options
    const minty = await MakeMinty()
    const nft = await minty.getNFT(tokenId, {fetchCreationInfo})
    console.log(nft)
}

async function pinNFTData(tokenId) {
    const minty = await MakeMinty()
    const {assetURI, metadataURI} = await minty.pinTokenData(tokenId)
    console.log(`Pinned all data for token id ${tokenId}`)
}

async function deploy(options) {
    const filename = options.output
    const info = await deployContract(options.name, options.symbol)
    await saveDeploymentInfo(info, filename)
}


// ---- main entry point when running as a script

// make sure we catch all errors
main().then(() => {
    process.exit(0)
}).catch(err => {
    console.error(err)
    process.exit(1)
})
