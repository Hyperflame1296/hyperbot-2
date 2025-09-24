// import: local classes
import { Interval } from './Interval.js'
import { Thread } from './Thread.js'
import { Blip } from './Blip.js'

// import: constant settings
import constantSettings from '../../constantSettings.json' with { type: "json" }

class Visualizer {
    thread: Thread
    blipBufferLength: number
    blipBufferFlushInterval: Interval
    startTime: number
    lastFlush: number
    blipBuffer: Blip[]
    constructor(thread: Thread) {
        this.thread = thread
        this.blipBufferLength = constantSettings.visualizer.buffer.length
        this.blipBuffer = []
        this.startTime = 0
        this.lastFlush = 0
        if (constantSettings.visualizer.buffer.enabled)
            this.blipBufferFlushInterval = new Interval('blipBufferFlushInterval', this.blipBufferLength, (function() {
                this.flushBlipBuffer()
            }).bind(this))
    }
    push(key: number, color: number) {
        if (!constantSettings.visualizer.enabled)
            return

        let o = performance.now() - this.lastFlush
        if (constantSettings.visualizer.buffer.enabled)
            this.blipBuffer.push({ k: key, t: performance.now(), c: color, o })
        else
            this.thread.worker.postMessage({ m: 'b', b: [{ k: key, t: performance.now(), c: color }] })
    }
    flushBlipBuffer() {
        if (!constantSettings.visualizer.enabled)
            return

        this.thread.worker.postMessage({ m: 'b', b: this.blipBuffer })
        this.blipBuffer = []
        this.lastFlush = performance.now()
    }
    start() {
        if (!constantSettings.visualizer.enabled)
            return
        
        this.startTime = performance.now()
        if (constantSettings.visualizer.buffer.enabled)
            this.blipBufferFlushInterval.start()
    }
}
export {
    Visualizer
}