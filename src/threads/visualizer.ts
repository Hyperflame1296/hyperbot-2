// import: constants
import { parentPort, workerData } from 'node:worker_threads';

// import: constant settings
import constantSettings from '../../constantSettings.json' with { type: "json" }

let { width, height } = workerData
var thread = {
    ansi: {
	    cursorTo: (x: number, y: number): string => `\x1b[${y};${x}H`,
        rgb: (r: number, g: number, b: number, text: string): string => 
            `\x1b[38;2;${Math.trunc(r * 255)};${Math.trunc(g * 255)};${Math.trunc(b * 255)}m${text}\x1b[0m`,
        rgbBg: (r: number, g: number, b: number, text: string): string => 
            `\x1b[48;2;${Math.trunc(r * 255)};${Math.trunc(g * 255)};${Math.trunc(b * 255)}m${text}\x1b[0m`,
        reset: (): string => '\x1b[0m'
    },
    keys: Array(88).fill(null).map(() => ({ blips: [], prevLength: 0 })),
    blipLimit: 16,
    hexToRGB: (h: number): [number, number, number] => {
        return [
            ((h >> 16) & 0xFF) / 255, // R
            ((h >> 8) & 0xFF) / 255,  // G
            (h & 0xFF) / 255          // B
        ];
    },
    mul: (a: [number, number, number], b: number): [number, number, number] => [a[0] * b, a[1] * b, a[2] * b],
    update: () => {
        var frame = ''
        let now = performance.now()
        for (let i = 0; i < thread.keys.length; i++) {
            let yoff = 0
            let key = thread.keys[i]
            let x = width - (87 - i) - 1
            if (!key)
                continue
            if (key.prevLength != key.blips.length)
                for (let j = 0; j <= thread.blipLimit; j++)
                    frame += thread.ansi.cursorTo(x, j) + ' ' + thread.ansi.reset()
            if (key.blips.length <= 0)
                continue
            for (let j = 0; j < key.blips.length; j++) {
                let blip = key.blips[j]
                if (!blip)
                    continue
                if (now - blip.t > 1000) {
                    key.blips.splice(key.blips.indexOf(blip), 1)
                    yoff++
                    continue
                }
                let y = thread.blipLimit - key.blips.indexOf(blip)
                let brightness = (1000 - (now - blip.t)) / 1000
                let color: [number, number, number] = thread.mul(thread.hexToRGB(blip.c), brightness)
                frame += thread.ansi.cursorTo(x, y + yoff) + thread.ansi.rgbBg(...color, ' ') + thread.ansi.reset()
            }
        }
        process.stdout.write(frame)
    }
}
parentPort.on('message', e => {
    switch (e.m) {
        case 'b':
            for (let b of e.b) {
                let key = thread.keys[b.k]
                if (!key)
                    continue
                if (b.o && b.o > 0)
                    setTimeout(() => {
                        key.prevLength = Math.min(key.blips.length, thread.blipLimit)
                        if (key.blips.length >= thread.blipLimit)
                            key.blips.shift()
                        key.blips.push(b)
                    }, b.o)
                else {
                    key.prevLength = Math.min(key.blips.length, thread.blipLimit)
                    if (key.blips.length >= thread.blipLimit)
                        key.blips.shift()
                    key.blips.push(b)
                }
            }
            break
    }
})

function loop() {
    setInterval(thread.update, 1000 / constantSettings.visualizer.maxFps)
}
loop()