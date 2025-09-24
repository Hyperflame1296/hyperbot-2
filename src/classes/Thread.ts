// import: classes
import { Worker } from 'node:worker_threads'

// import: constants
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Thread {
    name: string
    path: string
    worker: Worker | undefined
    constructor(name: string, location: string, data: object = {}) {
        if (!name)
            throw new Error(`Thread.constructor - Please specify a name for this thread.`)

        if (!path)
            throw new Error(`Thread.constructor - Please specify a path for this thread.`)

        this.name = name
        this.path = location
        this.worker = new Worker(this.path, {
            workerData: Object.assign({
                width: process.stdout.columns,
                height: process.stdout.rows
            }, data)
        })
    }
}
export {
    Thread
}