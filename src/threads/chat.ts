import { parentPort, workerData } from 'node:worker_threads'
import color from 'cli-color'

var { width, height } = workerData
var thread = {
    terminalInput: '',
    chatHistory: [],
    inputHistory: [],
    inputIndex: 0,
    ansi: {
	    cursorTo: (x: number, y: number): string => `\x1b[${y};${x}H`,
        rgb: (r: number, g: number, b: number, text: string): string => {
            return `\x1b[38;2;${Math.floor(r * 255)};${Math.floor(g * 255)};${Math.floor(b * 255)}m${text}\x1b[0m`;
        },
        rgbBg: (r: number, g: number, b: number, text: string): string => {
            return `\x1b[48;2;${Math.floor(r * 255)};${Math.floor(g * 255)};${Math.floor(b * 255)}m${text}\x1b[0m`;
        }
    },
    tags: {
        info: `[${color.cyanBright('INFO')}] »`,
        note: `[${color.greenBright('NOTE')}] »`,
        warn: `[${color.yellowBright('WARN')}] »`,
        error: `[${color.redBright('ERROR')}] »`
    },
    hexToRGB: (h: number): [number, number, number] => {
        return [
            ((h >> 16) & 0xFF) / 255, // R
            ((h >> 8) & 0xFF) / 255,  // G
            (h & 0xFF) / 255          // B
        ];
    },
    getTime: (x: number): string => {
        let g = new Date(x);
        let h   = g.getHours()
        let m   = g.getMinutes()
        let s   = g.getSeconds()
        let pad = (n: number) => n.toString().padStart(2, '0');
        return `${pad(h)}:${pad(m)}:${pad(s)}`;
    },        
    update: () => {
        let str = ''
        for (let i = 0; i < thread.chatHistory.length; i++) {
            let e = thread.chatHistory[i]
            let y = height - i - 3
            if (y < 17) continue
            if (!e) continue
            switch (e.m) {
                case 'l': // logs
                    var message = `[${color.whiteBright(thread.getTime(e.t))}] ${thread.tags.info } ${e.message}`.substring(0, width - 1)
                    str += thread.ansi.cursorTo(1, y) + ' '.repeat(width - 1)
                    str += thread.ansi.cursorTo(1, y) + message
                    break
                case 'w': // warnings
                    var message = `[${color.whiteBright(thread.getTime(e.t))}] ${thread.tags.warn } ${e.message}`.substring(0, width - 1)
                    str += thread.ansi.cursorTo(1, y) + ' '.repeat(width - 1)
                    str += thread.ansi.cursorTo(1, y) + message
                    break
                case 'e': // errors
                    var message = `[${color.whiteBright(thread.getTime(e.t))}] ${thread.tags.error} ${e.message}`.substring(0, width - 1)
                    str += thread.ansi.cursorTo(1, y) + ' '.repeat(width - 1)
                    str += thread.ansi.cursorTo(1, y) + message
                    break
                case 'j': // notifications
                    var message = `[${color.whiteBright(thread.getTime(e.t))}] ${thread.tags.note} ${e.message}`.substring(0, width - 1)
                    str += thread.ansi.cursorTo(1, y) + ' '.repeat(width - 1)
                    str += thread.ansi.cursorTo(1, y) + message
                    break
                case 'a':
                    let msgColor = thread.hexToRGB(parseInt(e.p.color.replace('#', ''), 16))
                    let reply = thread.chatHistory.find(m => m.id && e.r && m.id === e.r)
                    let replyColor: [number, number, number] = reply && reply.p ? thread.hexToRGB(parseInt(reply.p.color.replace('#', ''), 16)) : [0.466, 0.466, 0.466]
                    var message = `[${color.whiteBright(thread.getTime(e.t))}] [${e.p.id === 'console' ? color.greenBright(e.p.id) : color.greenBright(e.p.id.substr(0, 6))}]${reply && reply.p ? ` ${thread.ansi.rgbBg(...replyColor, color.black(`➦ ${reply.p.name ?? 'Unknown Message'}`))} ` : ' '}${thread.ansi.rgb(...msgColor, e.p.name)} ${color.white('»')} ${color.whiteBright(e.a ?? e.message)}`.substring(0, width - 1)
                    str += thread.ansi.cursorTo(1, y) + ' '.repeat(width - 1)
                    str += thread.ansi.cursorTo(1, y) + message
                    break
            }
        }
        str += thread.ansi.cursorTo(1, height - 2) + '_'.repeat(width - 1)
        str += thread.ansi.cursorTo(1, height - 1) + ' '.repeat(width - 1)
        str += thread.ansi.cursorTo(1, height - 1) + thread.terminalInput
        process.stdout.write(str)
    }
}
parentPort.on('message', e => {
    switch (e.m) {
        case 'i':
            thread.terminalInput = e.i
            break
        case 'en':
            thread.inputHistory.push(thread.terminalInput)
            thread.terminalInput = ''
            thread.inputIndex = thread.inputHistory.length - 1
            break
        case 'ua':
            if (thread.inputIndex === thread.inputHistory.length - 1)
                return
            thread.inputIndex -= 1
            thread.terminalInput = thread.inputHistory[thread.inputIndex] ?? ''
            break
        case 'da':
            if (thread.inputIndex === 0)
                return
            thread.inputIndex += 1
            thread.terminalInput = thread.inputHistory[thread.inputIndex] ?? ''
            break
        case 'la':
            break
        case 'ra':
            break
        case 's':
            width = e.w,
            height = e.h
            break
        default:
            if (thread.chatHistory.length >= 250)
                thread.chatHistory.pop()

            thread.chatHistory.unshift(e)
            break
    }
})

function loop() {
    setInterval(thread.update, 1000 / 20)
}
loop()