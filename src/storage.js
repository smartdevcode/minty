// the storage module will be responsible for adding and pinning assets to IPFS and creating NFT metadata

const fs = require('fs').promises
const path = require('path')

const IPFS = require('ipfs-core')
const all = require('it-all')
const uint8ArrayConcat = require('uint8arrays/concat')
const uint8ArrayToString = require('uint8arrays/to-string')


/**
 * AssetStorage coordinates storing assets to IPFS and pinning them for persistence.
 * Note that the class is not exported, since it requires async initialization.
 * @see MakeAssetStorage to construct.
 */
class AssetStorage {

    /**
     * @typedef {Object} AssetStorageConfig
     * @param {Array<PinningServiceConfig>} config.pinningServices
     *
     * @param {AssetStorageConfig} config
     */
    constructor(config) {
        this.config = config
        this._initialized = false
        this.ipfs = undefined
        this.pinningServices = []
    }

    async init() {
        if (this._initialized) {
            return
        }

        const silent = false
        this.ipfs = await IPFS.create({silent})

        for (const svc of this.config.pinningServices) {
            const {name, endpoint} = svc
            let key = svc.accessToken
            if (typeof svc.accessToken === 'function') {
                key = svc.accessToken()
            }

            await this.ipfs.pin.remote.service.add(name, {endpoint, key})
            this.pinningServices.push(name)
        }


        this._initialized = true
    }

    /**
     * addAsset adds the data from the file at `filename` to IPFS and "pins" it to make it
     * persistent so that it outlives the local IPFS node.
     *
     * If `assetData` is `null` or missing, the contents of `filename` will be read, if possible.
     * Note that if `assetData` is non-null, it will be used directly, and nothing will be read
     * from the local filesystem.
     *
     * @param filename - path to local file containing data, or descriptive filename to attach to the provided data.
     * @param assetData - if present, will be used instead of attempting to read files from disk.
     * @returns {Promise<string>} a Promise that resolves to a CID that can be used to fetch the file from IPFS,
     * or fails with an Error if something went wrong.
     */
    async addAsset(filename, assetData = null) {
        await this.init()

        // if the assetData is missing, try to read from the given filename
        if (assetData == null) {
            console.log('reading from ', filename)
            assetData = await fs.readFile(filename)
        }

        // Add the asset to IPFS
        const asset = await this.ipfs.add({
            path: path.basename(filename),
            content: assetData
        })

        console.log('added asset to IPFS: ', asset.cid)

        // Pin the asset to make it persistent
        await this.pin(asset.cid)
        return asset.cid
    }

    /**
     * pin sends requests to all configured remote pinning services to pin the given CID.
     * @param cid
     * @returns {Promise<void>}
     */
    async pin(cid) {
        await this.init()

        if (this.pinningServices.length < 1) {
            console.log('no pinning services configured, unable to pin ' + cid)
            return
        }


        // pin to all services in parallel and await the result
        const promises = []
        for (const service of this.pinningServices) {
            promises.push(this._pinIfUnpinned(cid, service))
        }
        try {
            await Promise.all(promises)
            console.log('pinned cid ', cid)
        } catch (e) {
            // TODO: propagate errors
            console.error("Pinning error: ", e)
        }
    }

    async _pinIfUnpinned(cid, service) {
        const pinned = await this.isPinned(cid, service)
        if (pinned) {
            console.log(`cid ${cid} already pinned`)
            return
        }
        await this.ipfs.pin.remote.add(cid, {service, background: false})
    }

    async isPinned(cid, service) {
        for await (const result of this.ipfs.pin.remote.ls({cid: [cid], service})) {
            return true
        }
        return false
    }

    async get(cidOrURI) {
        let cid = cidOrURI
        if (cidOrURI.startsWith('ipfs://')) {
            cid = cidOrURI.slice('ipfs://'.length)
        }

        return uint8ArrayConcat(await all(this.ipfs.cat(cid)))
    }

    async getString(cidOrURI) {
        const bytes = await this.get(cidOrURI)
        return uint8ArrayToString(bytes)
    }

    async getBase64String(cidOrURI) {
        const bytes = await this.get(cidOrURI)
        return uint8ArrayToString(bytes, 'base64')
    }
}

/**
 * MakeAssetStorage returns an initialized AssetStorage instance.
 * Prefer this to constructing an instance and manually calling .init()
 * @param {AssetStorageConfig} config
 * @returns {Promise<AssetStorage>}
 */
async function MakeAssetStorage(config) {
    const storage = new AssetStorage(config)
    await storage.init()
    return storage
}

module.exports = {
    MakeAssetStorage,
}
