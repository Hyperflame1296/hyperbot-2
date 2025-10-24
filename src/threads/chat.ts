import { parentPort, workerData } from 'node:worker_threads'
import color from 'cli-color'
let urlRegex = new RegExp(
    // protocol identifier (optional)
    // short syntax // still required
    '(?:(?:(?:https?|ftp):)?\\/\\/)' +
        // user:pass BasicAuth (optional)
        '(?:\\S+(?::\\S*)?@)?' +
        '(?:' +
        // IP address exclusion
        // private & local networks
        '(?!(?:10|127)(?:\\.\\d{1,3}){3})' +
        '(?!(?:169\\.254|192\\.168)(?:\\.\\d{1,3}){2})' +
        '(?!172\\.(?:1[6-9]|2\\d|3[0-1])(?:\\.\\d{1,3}){2})' +
        // IP address dotted notation octets
        // excludes loopback network 0.0.0.0
        // excludes reserved space >= 224.0.0.0
        // excludes network & broadcast addresses
        // (first & last IP address of each class)
        '(?:[1-9]\\d?|1\\d\\d|2[01]\\d|22[0-3])' +
        '(?:\\.(?:1?\\d{1,2}|2[0-4]\\d|25[0-5])){2}' +
        '(?:\\.(?:[1-9]\\d?|1\\d\\d|2[0-4]\\d|25[0-4]))' +
        '|' +
        // host & domain names, may end with dot
        // can be replaced by a shortest alternative
        // (?![-_])(?:[-\\w\\u00a1-\\uffff]{0,63}[^-_]\\.)+
        '(?:' +
        '(?:' +
        '[a-z0-9\\u00a1-\\uffff]' +
        '[a-z0-9\\u00a1-\\uffff_-]{0,62}' +
        ')?' +
        '[a-z0-9\\u00a1-\\uffff]\\.' +
        ')+' +
        // TLD identifier name, may end with dot
        '(?:[a-z\\u00a1-\\uffff]{2,}\\.?)' +
        ')' +
        // port number (optional)
        '(?::\\d{2,5})?' +
        // resource path (optional)
        '(?:[/?#]\\S*)?',
    'ig'
)
let markdownRegex =
    /((?:\\|)(?:\|\|.+?\|\||```.+?```|``.+?``|`.+?`|\*\*\*.+?\*\*\*|\*\*.+?\*\*|\*.+?\*|___.+?___|__.+?__|_.+?_(?:\s|$)|~~.+?~~))/g

let getTextContent = (text: string): string => {
    return text.indexOf('>') > -1 && text.indexOf('</') > -1
        ? text.slice(text.indexOf('>') + 1, text.lastIndexOf('</')) || text
        : text
}
let getLinkTextContent = (text: string): string => {
    var rightArrowIndex = text.indexOf('>')
    var leftArrowSlashIndex = text.lastIndexOf('</')
    var properRightArrowIndex = rightArrowIndex > leftArrowSlashIndex ? -1 : rightArrowIndex
    return properRightArrowIndex > -1 || leftArrowSlashIndex > -1
        ? text.slice(
              properRightArrowIndex > -1 ? properRightArrowIndex + 1 : 0,
              leftArrowSlashIndex > -1 ? leftArrowSlashIndex : text.length
          ) || text
        : text
}

let parseUrl = (text: string) => {
    return text.replace(urlRegex, (match) => {
        var url = getLinkTextContent(match)
        return thread.ansi.underline(thread.ansi.rgb(255, 68, 102, url))
    })
}
let parseMarkdown = (text: string, parseFunction = (t: string) => t) => {
    return text
        .split(markdownRegex)
        .map((match: string) => {
            let endsWithTildes = match.endsWith('~~')
            let endsWithThreeUnderscores = match.endsWith('___')
            let endsWithTwoUnderscores = match.endsWith('__')
            let endsWithUnderscore = match.endsWith('_')
            let endsWithThreeAsterisks = match.endsWith('***')
            let endsWithTwoAsterisks = match.endsWith('**')
            let endsWithAsterisk = match.endsWith('*')
            let endsWithThreeBackticks = match.endsWith('```')
            let endsWithTwoBackticks = match.endsWith('``')
            let endsWithBacktick = match.endsWith('`')
            let endsWithVerticalBars = match.endsWith('||')
            if (
                (match.startsWith('\\~~') && endsWithTildes) ||
                (match.startsWith('\\___') && endsWithThreeUnderscores) ||
                (match.startsWith('\\__') && endsWithTwoUnderscores) ||
                (match.startsWith('\\_') && endsWithUnderscore) ||
                (match.startsWith('\\***') && endsWithThreeAsterisks) ||
                (match.startsWith('\\**') && endsWithTwoAsterisks) ||
                (match.startsWith('\\*') && endsWithAsterisk) ||
                (match.startsWith('\\```') && endsWithThreeBackticks) ||
                (match.startsWith('\\``') && endsWithTwoBackticks) ||
                (match.startsWith('\\`') && endsWithBacktick) ||
                (match.startsWith('\\||') && endsWithVerticalBars)
            ) {
                return parseFunction(match.slice(1))
            } else if (match.startsWith('~~') && endsWithTildes) {
                let content = parseMarkdown(getTextContent(match.slice(2, match.length - 2)), parseFunction)
                return content.trim().length < 1 ? match : thread.ansi.crossed(content)
            } else if (match.startsWith('___') && endsWithThreeUnderscores) {
                let content = parseMarkdown(getTextContent(match.slice(3, match.length - 3)), parseFunction)
                return content.trim().length < 1 ? match : thread.ansi.italic(thread.ansi.underline(content))
            } else if (match.startsWith('__') && endsWithTwoUnderscores) {
                let content = parseMarkdown(getTextContent(match.slice(2, match.length - 2)), parseFunction)
                return content.trim().length < 1 ? match : thread.ansi.underline(content)
            } else if (match.startsWith('***') && endsWithThreeAsterisks) {
                let content = parseMarkdown(getTextContent(match.slice(3, match.length - 3)), parseFunction)
                return content.trim().length < 1
                    ? match
                    : thread.ansi.italic(thread.ansi.bold(content))
            } else if (match.startsWith('**') && endsWithTwoAsterisks) {
                let content = parseMarkdown(getTextContent(match.slice(2, match.length - 2)), parseFunction)
                return content.trim().length < 1 ? match : thread.ansi.bold(content)
            } else if ((match.startsWith('*') && endsWithAsterisk) || (match.startsWith('_') && endsWithUnderscore)) {
                let content = parseMarkdown(getTextContent(match.slice(1, match.length - 1)), parseFunction)
                return content.trim().length < 1 ? match : thread.ansi.italic(content)
            } else if (match.startsWith('`') && endsWithBacktick) {
                var slice =
                    match.startsWith('```') && endsWithThreeBackticks
                        ? 3
                        : match.startsWith('``') && endsWithTwoBackticks
                          ? 2
                          : 1
                let content = getTextContent(match.slice(slice, match.length - slice))
                return content.trim().length < 1 ? match : thread.ansi.rgbBg(34, 34, 34, content)
            }
            return parseFunction(match)
        })
        .join('')
}
var { width, height } = workerData
var thread = {
    terminalInput: '',
    chatHistory: [],
    ansi: {
	    cursorTo: (x: number, y: number): string => `\x1b[${y};${x}H`,
        rgb: (r: number, g: number, b: number, text: string): string => {
            return `\x1b[38;2;${Math.floor(r)};${Math.floor(g)};${Math.floor(b)}m${text}\x1b[0m`;
        },
        rgbBg: (r: number, g: number, b: number, text: string): string => {
            return `\x1b[48;2;${Math.floor(r)};${Math.floor(g)};${Math.floor(b)}m${text}\x1b[0m`;
        },
        reset: () => '\x1b[0m',
        bold: (text: string): string => {
            return `\x1b[1m${text}\x1b[22m`;
        },
        italic: (text: string): string => {
            return `\x1b[3m${text}\x1b[23m`;
        },
        underline: (text: string): string => {
            return `\x1b[4m${text}\x1b[24m`;
        },
        crossed: (text: string): string => {
            return `\x1b[9m${text}\x1b[29m`;
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
            ((h >> 16) & 0xFF), // R
            ((h >> 8) & 0xFF),  // G
            (h & 0xFF)          // B
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
                    var message = `${thread.ansi.reset()}[${color.whiteBright(thread.getTime(e.t))}] ${thread.tags.info } ${parseMarkdown(e.a ?? e.message, parseUrl)}`.substring(0, width - 1)
                    str += thread.ansi.cursorTo(1, y) + ' '.repeat(width - 1)
                    str += thread.ansi.cursorTo(1, y) + message
                    break
                case 'w': // warnings
                    var message = `${thread.ansi.reset()}[${color.whiteBright(thread.getTime(e.t))}] ${thread.tags.warn } ${parseMarkdown(e.a ?? e.message, parseUrl)}`.substring(0, width - 1)
                    str += thread.ansi.cursorTo(1, y) + ' '.repeat(width - 1)
                    str += thread.ansi.cursorTo(1, y) + message
                    break
                case 'e': // errors
                    var message = `${thread.ansi.reset()}[${color.whiteBright(thread.getTime(e.t))}] ${thread.tags.error} ${parseMarkdown(e.a ?? e.message, parseUrl)}`.substring(0, width - 1)
                    str += thread.ansi.cursorTo(1, y) + ' '.repeat(width - 1)
                    str += thread.ansi.cursorTo(1, y) + message
                    break
                case 'j': // notifications
                    var message = `${thread.ansi.reset()}[${color.whiteBright(thread.getTime(e.t))}] ${thread.tags.note} ${parseMarkdown(e.a ?? e.message, parseUrl)}`.substring(0, width - 1)
                    str += thread.ansi.cursorTo(1, y) + ' '.repeat(width - 1)
                    str += thread.ansi.cursorTo(1, y) + message
                    break
                case 'a':
                    let msgColor = thread.hexToRGB(parseInt(e.p.color.replace('#', ''), 16))
                    let reply = thread.chatHistory.find(m => m.id && e.r && m.id === e.r)
                    let replyColor: [number, number, number] = reply && reply.p ? thread.hexToRGB(parseInt(reply.p.color.replace('#', ''), 16)) : [0.466, 0.466, 0.466]
                    let msgStrip = `[${thread.getTime(e.t)}] [${e.p.id === 'console' ? e.p.id : e.p.id.substr(0, 6)}]${reply && reply.p ? ` ${`➦ ${reply.p.name ?? 'Unknown Message'}`} ` : ' '}${e.p.name} ${'»'} `
                    var message = `${thread.ansi.reset()}[${color.whiteBright(thread.getTime(e.t))}] [${e.p.id === 'console' ? color.greenBright(e.p.id) : color.greenBright(e.p.id.substr(0, 6))}]${reply && reply.p ? ` ${thread.ansi.rgbBg(...replyColor, color.black(`➦ ${reply.p.name ?? 'Unknown Message'}`))} ` : ' '}${thread.ansi.rgb(...msgColor, e.p.name)} ${color.white('»')} ${color.whiteBright(parseMarkdown(e.a ?? e.message, parseUrl))}`.replaceAll('\x07', '').substring(0, width + msgStrip.length - 1)
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