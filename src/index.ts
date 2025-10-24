// import: classes
import { JsonDB, Config } from 'node-json-db'

// import: constants
import fs from 'node:fs'
import color from 'cli-color'
import dotenv from 'dotenv'
import midi from '@julusian/midi'

// import: local classes
import { NoteQuota } from './classes/NoteQuota.js'
import { Client } from './modules/mpp-client-net/index.js'
import { Player } from './modules/jmidiplayer/index.js'
import { Visualizer } from './classes/Visualizer.js'
import { Interval } from './classes/Interval.js'
import { Thread } from './classes/Thread.js'

// import: local interfaces
import { Command } from './interfaces/Command.js'

// import: constant settings
import constantSettings from '../constantSettings.json' with { type: "json" }
var prefix = '::'
var room = constantSettings.room
var ver = 'v1.0.0-beta'
var name = `Hyperbot 2 [ ::help ]`
var keys = ['a-1','as-1','b-1','c0','cs0','d0','ds0','e0','f0','fs0','g0','gs0','a0','as0','b0','c1','cs1','d1','ds1','e1','f1','fs1','g1','gs1','a1','as1','b1','c2','cs2','d2','ds2','e2','f2','fs2','g2','gs2','a2','as2','b2','c3','cs3','d3','ds3','e3','f3','fs3','g3','gs3','a3','as3','b3','c4','cs4','d4','ds4','e4','f4','fs4','g4','gs4','a4','as4','b4','c5','cs5','d5','ds5','e5','f5','fs5','g5','gs5','a5','as5','b5','c6','cs6','d6','ds6','e6','f6','fs6','g6','gs6','a6','as6','b6','c7']
var volume
var sustain
var deblackVel
var synth
var synthOutput = new midi.Output()

let globalPromise = Promise.withResolvers()
if (fs.existsSync('./.env')) {
	dotenv.configDotenv()
	process.stdin.setRawMode(true)
	globalPromise.resolve(1)
} else {
	console.clear()
	console.log(color.yellowBright('Please input a token.'))
	console.log(color.yellowBright('- Invalid tokens will siteban you, so be careful!'))
	console.log(color.yellowBright('- This will be saved once you hit Enter.'))
	function cb(d) {
		let decoder = new TextDecoder()
		let token = decoder.decode(d)
		fs.writeFileSync('./.env', `TOKEN=\'${token.trim()}\'`, 'utf-8')
		dotenv.configDotenv()
		process.stdin.off('data', cb)
		process.stdin.setRawMode(true)
		globalPromise.resolve(1)
	}
	process.stdin.on('data', cb)
}
await globalPromise.promise
let bot = {
	// properties & constants
    db: new JsonDB(new Config('localStorage', true, false, '/')),
	terminalInput: '',
    chatHistory: [],
    inputHistory: [],
    inputIndex: 0,
    textDecoder: new TextDecoder,
    initialized: false,
	player: new Player,
	client: new Client('wss://mppclone.com', process.env.TOKEN),
	noteQuota: new NoteQuota(undefined, NoteQuota.PARAMS_OFFLINE),
	mouse: {
        gravity: 0.1,
        hspeed : 0.0,
        vspeed : 0.0,
        x      : 50,
        y      : 0
    },
    threads: [
        new Thread('chat', './dist/threads/chat.js'),
		new Thread('visualizer', './dist/threads/visualizer.js'),
		new Thread('cursor', './dist/threads/cursors.js'),
    ],
	tags: {
		info: `[${color.cyanBright('INFO')}] »`,
		warn: `[${color.yellowBright('WARN')}] »`,
		error: `[${color.redBright('ERROR')}] »`,
		success_mpp: `✅ » `,
		info_mpp: `🟦 » `,
		failure_mpp: `🟥 » `
	},
    ansi: {
	    cursorTo: (x: number, y: number): string => `\x1b[${y};${x}H`,
        rgb: (r: number, g: number, b: number, text: string): string => {
            return `\x1b[38;2;${Math.floor(r * 255)};${Math.floor(g * 255)};${Math.floor(b * 255)}m${text}\x1b[0m`;
        },
        rgbBg: (r: number, g: number, b: number, text: string): string => {
            return `\x1b[48;2;${Math.floor(r * 255)};${Math.floor(g * 255)};${Math.floor(b * 255)}m${text}\x1b[0m`;
        }
    },
	channelColors: [
        0xff0000,
        0xff8800,
        0xffff00,
        0x88ff00,
        0x00ff00,
        0x00ff44,
        0x00ff88,
        0x00ffbb,
        0x00ffff,
        0x0088ff,
        0x0000ff,
        0x8800ff,
        0xff00ff,
        0xff00bb,
        0xff0088,
        0xff0044,
    ],
	// intervals
    intervals: [
        new Interval('mouse', 50, function() {
            bot.mouse.vspeed += bot.mouse.gravity;
            if (bot.mouse.x + bot.mouse.hspeed > 100 || bot.mouse.x + bot.mouse.hspeed < 0)
                bot.mouse.hspeed *= -1;
            else
                bot.mouse.x += bot.mouse.hspeed
            
            if (bot.mouse.y + bot.mouse.vspeed > 100) {
                bot.mouse.vspeed *= -1;
                bot.mouse.hspeed += Math.random() * 1 - 0.5
            } else
                bot.mouse.y += bot.mouse.vspeed
            bot.mouse.hspeed = Math.min(Math.max(bot.mouse.hspeed, -1), 1)
            bot.client.setCursor(bot.mouse.x, bot.mouse.y)
        })
	],
	// commands
	commands: {
		main: [
			{
				name: 'help',
				desc: 'Shows what commands there are in this bot.',
				syntax: `${prefix}help [command]`,
				aliases: ['h'],
				func: function(a: string[], input: string, msg: any) {
					let c = a[1]?.trim() ?? ''
					let categories = Object.keys(bot.commands)
					if (c === '')
						bot.send([
							bot.tags.success_mpp + `Categories: ${categories.join(', ')}.`,
							bot.tags.info_mpp    + `Type \`\`\`${prefix}help [category]\`\`\` to view all of the commands for one of these categories.`
						])
					else {
						if (c.startsWith(prefix)) {
							let command = bot.findCommand(c.replace(prefix, ''))
							if (!command)
								return bot.send(bot.tags.failure_mpp + `There is no command named \`${c}\`.`)

							bot.send([
								bot.tags.success_mpp + `\`${prefix}${command.name}\` - *${command.desc}*`,
								bot.tags.info_mpp    + `Syntax: \`\`\`${command.syntax}\`\`\``,
								bot.tags.info_mpp    + `Aliases: ${command.aliases.map((c: string) => `\`${prefix}${c}\``).join(', ')}`
							])
						} else {
							if (categories.includes(c))
								bot.send(bot.tags.success_mpp + `Commands for category \'${c}\': ${bot.commands[c].map((c: Command) => `\`${prefix}${c.name}\``).join(', ')}.`)
							else
								bot.send([
									bot.tags.failure_mpp + `There is no category named \`${c}\`.`,
									bot.tags.info_mpp + `Trying to get help on a command? Try \`${prefix}help ${prefix}${c}\` instead.`
								])
						}
					}
				}
			},
			{
				name: 'about',
				desc: 'Shows information about the bot.',
				syntax: `${prefix}about`,
				aliases: ['a'],
				func: function(a: string[], input: string, msg: any) {
					bot.send([
						bot.tags.success_mpp + `Hyperbot 2 (${ver}) - The Great Refactor (not open-source yet, will be soon)`, 
						'- Made by TensiveYT'
					])
				}
			},
		],
		midi: [
			{
				name: 'midi',
				desc: 'Play, a MIDI.',
				syntax: `${prefix}midi <play | stop | pause | resume> [arg]`,
				aliases: ['p'],
				func: async function(a: string[], input: string, msg: any) {
					let c = a[1]?.trim() ?? '',
						d = a[2]?.toLowerCase()?.trim() ?? ''
					try {
						if (c === '') {
							bot.send([
								bot.tags.failure_mpp + `What do you want to do?`, 
								`Type \`${prefix}help ::midi\` to see the syntax of this command.`
							])
						} else {
							switch (c) {
								case 'play':
									if (!bot.player.isPlaying) {
										if (d === '')
											bot.send([
												bot.tags.failure_mpp + `Please specify the URL or path to the MIDI you want to play.`, 
												`Type \`${prefix}help ::midi\` to see the syntax of this command.`
											])
										else if (fs.existsSync(`midis/${d}.mid`)) {
											bot.send(bot.tags.success_mpp + `Loading MIDI \`${d}\`...`)
											let start = performance.now()
											await bot.player.loadFile(`midis/${d}.mid`)
											let end = performance.now()
											let time = end - start
											bot.send(bot.tags.success_mpp + `Loaded MIDI in \`${(time / 1000).toFixed(2)}s\`! | Playing MIDI \`${d}\`.`)
											bot.player.play()
										} else
											try {
												let url = new URL(d)
												bot.send(bot.tags.success_mpp + `Fetching MIDI \`${d}\`...`)
												let f = await fetch(url)
												let type = f.headers.get('Content-Type')
												if (!f.ok) throw new Error(bot.tags.failure_mpp + `HTTP error, status: ${f.status}`)
												if (type && !(type.includes('midi') || type.includes('mid'))) throw new Error(bot.tags.failure_mpp + `The URL you provided is not a MIDI file. Content-Type: \`${type}\``)
												let data = await f.arrayBuffer()
												bot.send(bot.tags.success_mpp + `Loading MIDI \`${d}\`...`)
												await bot.player.loadArrayBuffer(data)
												bot.send(bot.tags.success_mpp + `Playing MIDI \`${d}\`.`)
												bot.player.play()
											} catch (err) {
												bot.send(bot.tags.failure_mpp + `\`\`\`${err}\`\`\``)
											}
									} else {
										bot.send(bot.tags.failure_mpp + 'A MIDI is currently playing.')
									}
									break
								case 'stop':
									if (!bot.player.isPlaying)
										bot.send(bot.tags.failure_mpp + 'No MIDI is currently playing.')
									else {
										bot.player.stop()
										bot.send(bot.tags.success_mpp + `Stopped the currently playing MIDI.`)
									}
									break
								case 'pause':
									if (!bot.player.isPlaying)
										bot.send(bot.tags.failure_mpp + 'No MIDI is currently playing.')
									else {
										bot.player.pause()
										bot.send(bot.tags.success_mpp + `Paused the currently playing MIDI.`)
									}
									break
								case 'resume':
									if (bot.player.isPlaying)
										bot.send(bot.tags.failure_mpp + 'The MIDI is already playing.')
									else {
										bot.player.play()
										bot.send(bot.tags.success_mpp + `Resumed the currently paused MIDI.`)
									}
									break
								default:
									bot.send([
										bot.tags.failure_mpp + `There is no \`${prefix}midi\` subcommand named \`${c}\`.`, 
										`Type \`${prefix}help ::midi\` to see the syntax of this command.`
									])
									break
							}
						}
					} catch (err) {
						bot.send(bot.tags.failure_mpp + `\`\`\`${err}\`\`\``)
					}
				}
			},
			{
				name: 'midiset',
				desc: 'Configure the bot\'s MIDI playback.',
				syntax: `${prefix}midi <volume | sustain | deblack | synth | quota.enabled | quota.threshold> [arg]`,
				aliases: ['ms'],
				func: async function(a: string[], input: string, msg: any) {
					let c = a[1]?.trim() ?? '',
						d = a[2]?.toLowerCase()?.trim() ?? ''
					try {
						if (c === '') {
							bot.send([
								bot.tags.failure_mpp + `What do you want to do?`, 
								`Type \`${prefix}help ::midiset\` to see the syntax of this command.`
							])
						} else {
							switch (c) {
								case 'volume':
									let x = parseFloat(d)
									if (d === '')
										bot.send([
											bot.tags.sucesss_mpp + `\`${c}\` is currently \`${volume}\`.`
										])
									else if (isNaN(x))
										bot.send([
											bot.tags.failure_mpp + `\`${d}\` is not a valid number.`, 
											`Type \`${prefix}help ::midiset\` to see the syntax of this command.`
										])
									else {
										if (x > 1.0)
											bot.send([
												bot.tags.failure_mpp + `\`${c}\` cannot be greater than \`1.0\`.`, 
												`Type \`${prefix}help ::midiset\` to see the syntax of this command.`
											])
										else if (x <= 0.0)
											bot.send([
												bot.tags.failure_mpp + `\`${c}\` cannot be less than, or equal to \`0.0\`.`, 
												`Type \`${prefix}help ::midiset\` to see the syntax of this command.`
											])
										else {
											volume = x
											bot.send(bot.tags.success_mpp + `Set \`${c}\` to \`${x % 1.0 === 0.0 ? x.toFixed(1.0) : x}\`.`)
										}
									}
									break
								case 'deblack':
									var y = parseInt(d)
									if (d === '')
										bot.send([
											bot.tags.success_mpp + `\`${c}\` is currently \`${deblackVel}\`.`
										])
									else if (isNaN(y))
										bot.send([
											bot.tags.failure_mpp + `\`${c}\` is not a valid number.`, 
											`Type \`${prefix}help ::midiset\` to see the syntax of this command.`
										])
									else {
										if (y > 127)
											bot.send([
												bot.tags.failure_mpp + `\`${c}\` cannot be greater than \`127\`.`, 
												`Type \`${prefix}help ::midiset\` to see the syntax of this command.`
											])
										else if (y < -1)
											bot.send([
												bot.tags.failure_mpp + `\`${c}\` cannot be less than \`-1\`.`, 
												`Type \`${prefix}help ::midiset\` to see the syntax of this command.`
											])
										else {
											deblackVel = y
											bot.send(bot.tags.success_mpp + `Set \`${c}\` to \`${y.toFixed()}\`.`)
										}
									}
									break
								case 'quota.threshold':
									var y = parseInt(d)
									if (d === '')
										bot.send([
											bot.tags.success_mpp + `\`${c}\` is currently \`${constantSettings.player.noteQuota.threshold}\`. (this value does not save)`
										])
									else if (isNaN(y))
										bot.send([
											bot.tags.failure_mpp + `\`${d}\` is not a valid number.`, 
											`Type \`${prefix}help ::midiset\` to see the syntax of this command.`
										])
									else {
										if (y > bot.noteQuota.max)
											bot.send([
												bot.tags.failure_mpp + `\`${c}\` cannot be greater than \`${bot.noteQuota.max}\`.`, 
												`Type \`${prefix}help ::midiset\` to see the syntax of this command.`
											])
										else if (y < 0)
											bot.send([
												bot.tags.failure_mpp + `\`${c}\` cannot be less than \`0\`.`, 
												`Type \`${prefix}help ::midiset\` to see the syntax of this command.`
											])
										else {
											constantSettings.player.noteQuota.threshold = y
											bot.send(bot.tags.success_mpp + `Set \`${c}\` to \`${y.toFixed()}\`.`)
										}
									}
									break
								case 'quota.enabled':
									constantSettings.player.noteQuota.enabled = !constantSettings.player.noteQuota.enabled
									bot.send(bot.tags.success_mpp + `Toggled \`${c}\` to \`${constantSettings.player.noteQuota.enabled.toLocaleString()}\`.`)
									break
								case 'sustain':
									sustain = !sustain
									bot.send(bot.tags.success_mpp + `Toggled \`${c}\` to \`${sustain.toLocaleString()}\`.`)
									break
								case 'synth':
									synth = !synth
									bot.send(bot.tags.success_mpp + `Toggled \`${c}\` to \`${synth.toLocaleString()}\`.`)
									break
								default:
									bot.send([
										bot.tags.failure_mpp + `There is no \`${prefix}midiset\` subcommand named \`${c}\`.`, 
										`Type \`${prefix}help ::midiset\` to see the syntax of this command.`
									])
									break
							}
						}
					} catch (err) {
						bot.send(bot.tags.failure_mpp + `\`\`\`${err}\`\`\``)
					}
				}
			}
		],
		economy: [
			{
				name: 'money',
				desc: 'Use a money command.',
				syntax: `${prefix}money <work | balance>`,
				aliases: ['m'],
				func: async function(a: string[], input: string, msg: any) {
					let c = a[1]?.toLowerCase()?.trim() ?? '',
						d = a[2]?.toLowerCase()?.trim() ?? ''
					let defaultAccount = { items: [], xp: 0, lvl: 0, money: 0, working: false }
					!await bot.db.exists(`/money/${msg.p.id}`) ? await bot.db.push(`/money/${msg.p.id}`, defaultAccount, true) : void 0
					try {
						if (c === '') {
							bot.send([
								bot.tags.failure_mpp + `What do you want to do?`, 
								`Type \`${prefix}help ::money\` to see the syntax of this command.`
							])
						} else {
							switch (c) {
								case 'work':
									if (!((await bot.db.getData(`/money/${msg.p.id}`)) ?? defaultAccount).working) {
										let lvl = ((await bot.db.getData(`/money/${msg.p.id}`)) ?? defaultAccount).lvl
										let lvlat = 200 + lvl * 40
										let earn_money = 25 + lvl * 10 + Math.random() * (25 + lvl * 10)
										let earn_xp = 20
										bot.send(msg.id, `You have begun working. ✅️`)
										await bot.db.push(
											`/money/${msg.p.id}`,
											{
												items: ((await bot.db.getData(`/money/${msg.p.id}`)) ?? defaultAccount).items,
												xp: ((await bot.db.getData(`/money/${msg.p.id}`)) ?? defaultAccount).xp,
												lvl: lvl,
												money: ((await bot.db.getData(`/money/${msg.p.id}`)) ?? defaultAccount).money,
												working: true
											},
											true
										)
										setTimeout(
											async () => {
												let xp = ((await bot.db.getData(`/money/${msg.p.id}`)) ?? defaultAccount).xp
												if (xp + earn_xp >= lvlat) {
													while (xp + earn_xp >= lvlat) {
														xp -= lvlat
														lvlat = 200 + lvl * 40
														lvl += 1
													}
													await bot.db.push(
														`/money/${msg.p.id}`,
														{
															items: ((await bot.db.getData(`/money/${msg.p.id}`)) ?? defaultAccount).items,
															xp: xp + earn_xp,
															lvl: lvl,
															money: ((await bot.db.getData(`/money/${msg.p.id}`)) ?? defaultAccount).money,
															working: false
														},
														true
													)
													bot.send(msg.id, `You are now at level \`${lvl}\`! ✅️`)
												} else {
													await bot.db.push(
														`/money/${msg.p.id}`,
														{
															items: ((await bot.db.getData(`/money/${msg.p.id}`)) ?? defaultAccount).items,
															xp: xp + earn_xp,
															lvl: ((await bot.db.getData(`/money/${msg.p.id}`)) ?? defaultAccount).lvl,
															money: ((await bot.db.getData(`/money/${msg.p.id}`)) ?? defaultAccount).money + earn_money,
															working: false
														},
														true
													)
												}
												bot.send(msg.id, `You have earned \`${earn_money.toFixed(3)}H$\`, and \`${earn_xp}\` XP. ✅️`)
											},
											15000 + Math.random() * 10000 - lvl * 10
										)
									} else {
										bot.send(msg.id, `You are already working right now. 🟥`)
									}
									break
								case 'balance':
									let money = ((await bot.db.getData(`/money/${msg.p.id}`)) ?? defaultAccount).money
									let xp = ((await bot.db.getData(`/money/${msg.p.id}`)) ?? defaultAccount).xp
									let lvl = ((await bot.db.getData(`/money/${msg.p.id}`)) ?? defaultAccount).lvl
									let lvlat = 200 + lvl * 40
									bot.send(msg.id, `You have \`${money.toFixed(3)}H$\`, and \`${xp}\` XP. You are at level \`${lvl}\`,  and \`${lvlat - xp}\` XP will level you up further. ✅️`)
									break
								default:
									bot.send([
										bot.tags.failure_mpp + `There is no \`${prefix}money\` subcommand named \`${c}\`.`, 
										`Type \`${prefix}help ::money\` to see the syntax of this command.`
									])
									break
							}
						}
					} catch (err) {
						bot.send(bot.tags.failure_mpp + `\`\`\`${err}\`\`\``)
					}
				}
			},
		],
		text: [
			{
				name: 'say',
				desc: 'Makes the bot say something.',
				syntax: `${prefix}say <text>`,
				aliases: ['s'],
				func: function(a: string[], input: string, msg: any) {
					let c = a[1]?.trim() ?? ''
					if (c !== '') {
						bot.send(bot.tags.success_mpp + input)
					} else {
						bot.send([
							bot.tags.failure_mpp + 'What do you want the bot to say?', 
							`Type \`${prefix}help ::say\` to see the syntax of this command.`
						])
					}
				}
			}
		],
		admin: [
			{
				name: 'raw',
				desc: 'Sends a raw message to MPP.',
				syntax: `${prefix}raw <text>`,
				aliases: ['r'],
				permission: (p: number) => p >= 2,
				func: function(a: string[], input: string, msg: any) {
					let c = a[1]?.trim() ?? ''
					if (c !== '') {
						bot.send(input)
					} else {
						bot.send([
							bot.tags.failure_mpp + 'What do you want the bot to say?', 
							`Type \`${prefix}help ::say\` to see the syntax of this command.`
						])
					}
				}
			},
			{
				name: 'js',
				desc: 'Executes JavaScript code.',
				syntax: `${prefix}js <code>`,
				aliases: ['j', 'eval'],
				permission: (p: number) => p >= 3,
				func: function(a: string[], input: string, msg: any) {
					bot.eval(input)
						.then((res) => {
							let str = 'unknown type'
							switch (typeof res) {
								case 'number':
								case 'function':
								case 'symbol':
									str = res.toString()
									break
								case 'bigint':
									str = res.toString() + 'n'
									break
								case 'string':
									str = res
									break
								case 'boolean':
									str = res ? 'true' : 'false'
									break
								case 'object':
									str = JSON.stringify(res)
									break
								case 'undefined':
									str = 'undefined'
									break
								default:
									str = 'unknown type'
									break
							}
							bot.send(bot.tags.success_mpp + `\`\`\`${str}\`\`\``)
						})
						.catch(err => {
							bot.send(bot.tags.failure_mpp + `\`\`\`${err}\`\`\``)
						})
				}
			},
			{
				name: 'crown',
				desc: 'Modify the bot\'s room ownership.',
				syntax: `${prefix}crown <give | drop> [user id]`,
				aliases: ['c', 'o'],
				permission: (p: number) => p >= 2,
				func: function(a: string[], input: string, msg: any) {
					let c = a[1]?.trim() ?? '',
						d = a[2] ? a[2].trim() : '',
						e = a[3] ? a[3].trim() : ''
					if (bot.client.channel.crown.userId === bot.client.participantId) {
						if (c === '')
							return bot.send([
								bot.tags.failure_mpp + `What do you want to do?`, 
								`Type \`${prefix}help ::crown\` to see the syntax of this command.`
							])
						switch (c) {
							case 'give':
								if (d === '') {
									bot.client.sendArray([
										{
											m: 'chown',
											id: msg.p.id
										}
									])
									bot.send(bot.tags.success_mpp + `Gave the crown to \'${bot.client.findParticipantById(msg.p.id).name}\'!`)
								} else {
									if (bot.client.ppl[d]) {
										if (bot.client.participantId !== d) {
											bot.client.sendArray([
												{
													m: 'chown',
													id: d
												}
											])
											bot.send(bot.tags.success_mpp + `Gave the crown to \'${bot.client.findParticipantById(d).name}\'!`)
										} else {
											bot.send([
												bot.tags.failure_mpp + `The bot cannot give the crown to itself.`, 
												`Type \`${prefix}help ::crown\` to see the syntax of this command.`
											])
										}
									} else bot.send([
										bot.tags.failure_mpp + `The person with the ID you provided (\`${d}\`) doesn\'t exist in this room.`, 
										`Type \`${prefix}help ::crown\` to see the syntax of this command.`
									])
								}
								break
							case 'drop':
								bot.client.sendArray([
									{
										m: 'chown'
									}
								])
								bot.send(bot.tags.success_mpp + `Successfully dropped the crown.`)
								break
							default:
								bot.send([
									bot.tags.failure_mpp + `There is no \`${prefix}crown\` subcommand named \`${c}\`.`, 
									`Type \`${prefix}help ::crown\` to see the syntax of this command.`
								])
								break
						}
					} else 
						bot.send([
							bot.tags.failure_mpp + 'The bot does not currently have the crown.', 
							`Type \`${prefix}help ::crown\` to see the syntax of this command.`
						])
				}
			},
			{
				name: 'rank',
				desc: 'Modify a user\'s rank.',
				syntax: `${prefix}rank <get | set> [user id]`,
				aliases: ['r'],
				permission: (p: number) => p >= 3,
				func: async function(a: string[], input: string, msg: any) {
					let c = a[1]?.trim() ?? '',
						d = a[2] ? a[2].trim() : ''
					if (c === '')
						return bot.send([
							bot.tags.failure_mpp + `What do you want to do?`, 
							`Type \`${prefix}help ::rank\` to see the syntax of this command.`
						])
					switch (c) {
						case 'get':
							let rank = msg.p.id === 'console' ? 
								4 
							: 
								(
									(await bot.db.exists(`/permissions/${d === '' ? msg.p.id : d}`)) ?
										(await bot.db.getData(`/permissions/${d === '' ? msg.p.id : d}`)).commands ?? 0
									:
										0
								)
							let rankStr = '';
							bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage({ m: 'l', t: Date.now(), message: typeof rank }) 
							switch (rank) {
								case 0:
									rankStr = 'User'
									break
								case 1:
									rankStr = 'Moderator'
									break
								case 2:
									rankStr = 'Admin'
									break
								case 3:
									rankStr = 'Owner'
									break
								case 4:
									rankStr = 'Console'
									break
								default:
									rankStr = 'Unknown'
									break
							}
							if (d !== '')
								bot.send(bot.tags.success_mpp + `${bot.client.ppl[c].name}'s rank is: \`${rankStr}\``)
							else
								bot.send(bot.tags.success_mpp + `Your rank is: \`${rankStr}\``)
							break
						case 'set':
							return bot.send([
								bot.tags.failure_mpp + `you can\'t do this yet`, 
							])
							break
						default:
							bot.send([
								bot.tags.failure_mpp + `There is no \`${prefix}crown\` subcommand named \`${c}\`.`, 
								`Type \`${prefix}help ::crown\` to see the syntax of this command.`
							])
							break
					}
				}
			}
		]
	},
    hexToRGB: (h: number) => {
        return [
            ((h >> 16) & 0xFF) / 255, // R
            ((h >> 8) & 0xFF) / 255,  // G
            (h & 0xFF) / 255          // B
        ];
    },
    getTime: (x: number) => {
        let g = new Date(x);
        let h   = g.getHours()
        let m   = g.getMinutes()
        let s   = g.getSeconds()
        let pad = n => n.toString().padStart(2, '0');
        return `${pad(h)}:${pad(m)}:${pad(s)}`;
    },
	giveNoPermissionMessage: () => {
		let arr = [
			bot.tags.failure_mpp + 'You don\'t have permission to use this command!',
			bot.tags.failure_mpp + 'Uh, no.',
			bot.tags.failure_mpp + 'What are you trying to do?...',
			bot.tags.failure_mpp + 'Did you know that you don\'t have permission to use this command?',
			bot.tags.failure_mpp + 'Here\'s a tutorial on how to run that command: Step 1, you don\'t.',
			bot.tags.failure_mpp + 'You shall not pass!.',
			bot.tags.failure_mpp + 'You don\'t look like an admin!'
		]
		return arr[Math.floor(Math.random() * arr.length)]
	},
	send: (...args: string[]) => {
        switch (args.length) {
            case 1:
                var msgs = args[0] ?? []
                var arr = []
                switch (typeof msgs) {
                    case 'string':
                        arr.push({
                            m: 'a',
                            message: msgs
                        })
                        break
                    case 'object':
                        if (!Array.isArray(msgs))
                            throw new TypeError(`\`bot.send()\` - The message to send can only be of type Array or String. (\`typeof msgs == ${typeof msgs}\`)`)
                        arr.push(
                            ...msgs.map(m => 
                                ({
                                    m: 'a',
                                    message: m
                                })
                            )
                        )
                        break
                    default:
                        throw new TypeError(`Method \`bot.send()\` incompatible with type \`${typeof msgs}\``)
                }
				if (bot.client.isConnected())
                	bot.client.sendArray(arr)
				else
					for (let m of arr) {
						bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage(Object.assign(m, {
							t: Date.now(),
							p: {
								name: 'Console',
								id: 'console',
								color: '#777777'
							}
						}))
					}
                break
            case 2:
                var r = args[0]
                var msgs = args[1] ?? []
                var arr = []
                switch (typeof msgs) {
                    case 'string':
                        arr.push({
                            m: 'a',
                            message: msgs,
                            reply_to: r
                        })
                        break
                    case 'object':
                        if (!Array.isArray(msgs))
                            throw new TypeError(`\`bot.send()\` - The message to send can only be of type Array or String. (\`typeof msgs == ${typeof msgs}\`)`)
                        arr.push(
                            ...msgs.map(m => 
                                ({
                                    m: 'a',
                                    message: m,
                                    reply_to: r
                                })
                            )
                        )
                        break
                    default:
                        throw new TypeError(`\`bot.send()\` - Argument [2] incompatible with type \`${typeof msgs}\``)
                }
                if (bot.client.isConnected() && !bot.client.isConnecting())
                	bot.client.sendArray(arr)
				else
					for (let m of arr) {
						bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage(Object.assign(m, {
							t: Date.now(),
							p: {
								name: 'Console',
								id: 'console',
								color: '#777777'
							}
						}))
					}
                break
            default:
                throw new SyntaxError(`\`bot.send()\` - Invalid syntax for \`bot.send()\`. (\`args.length !== 1 && args.length !== 2\`)`)
        }
	},
	eval: (c: string) => {
		return new Promise((resolve, reject) => {
			let rejectTimeout = setTimeout(() => reject('Code evaluation timed out!'), 30000)
			let res = eval(c)
			clearTimeout(rejectTimeout)
			resolve(res)
		})
	},
    init: async() => {
        if (bot.initialized)
            throw new Error('Can\'t initialize the bot twice.')
        console.clear()
        bot.initialized = true
		bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage({ m: 'l', t: Date.now(), message: 'Initializing client...' }) 
		bot.client.start()
		bot.client.setChannel(room)
		bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage({ m: 's', w: process.stdout.columns, h: process.stdout.rows })
		bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage({ m: 'l', t: Date.now(), message: 'Initializing database...' }) 
        await bot.db.load()
		!await bot.db.exists('/settings')             ? bot.db.push('/settings', {}, false) : void 0
		!await bot.db.exists('/settings/volume')      ? bot.db.push('/settings/volume', 1, false) : void 0
		!await bot.db.exists('/settings/sustain')     ? bot.db.push('/settings/sustain', false, false) : void 0
		!await bot.db.exists('/settings/deblackVel')  ? bot.db.push('/settings/deblackVel', -1, false) : void 0
		!await bot.db.exists('/settings/synth')       ? bot.db.push('/settings/synth', false, false) : void 0
        volume = await bot.db.getData('/settings/volume')
        sustain = await bot.db.getData('/settings/sustain')
        deblackVel = await bot.db.getData('/settings/deblackVel')
        synth = await bot.db.getData('/settings/synth')
		bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage({ m: 'l', t: Date.now(), message: 'Initializing MIDI synth...' }) 
        for (let i = 0; i < synthOutput.getPortCount(); i++) {
            if (synthOutput.getPortName(i).includes('Keppy\'s Direct MIDI API')) {
                synthOutput.openPort(i)
                break
            }
            if (synthOutput.getPortName(i).includes('OmniMIDI')) {
                synthOutput.openPort(i)
                break
            }
        }
		bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage({ m: 'l', t: Date.now(), message: 'Setting up listeners...' })
		bot.client.on('hi', e => {
			bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage({ m: 'l', t: Date.now(), message: `The bot has connected to room \'${color.blueBright(room)}\'!` })
            bot.client.sendArray([
                {
                    m: 'userset',
                    set: {
                        name,
                        color: '#3355ff'
                    }
                }
            ])
            bot.intervals.find((i: Interval) => i.name === 'mouse').start()
        })
        bot.client.on('disconnect', (e: any) => {
			try {
				bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage({ m: 'l', t: Date.now(), message: bot.client.canConnect ? `The bot has disconnected. Attempting to reconnect...` : 'The client has been turned off.' })
				bot.intervals.find((i: Interval) => i.name === 'mouse').stop()
				bot.client.connect()
				bot.noteQuota.setParams(NoteQuota.PARAMS_OFFLINE)
			} catch (err) {
				bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage({ m: 'e', t: Date.now(), message: `bot.client.on('disconnect'): ${err}`})
			}
        })
		bot.client.on('nq', (e: any) => {
			try {
				bot.noteQuota.setParams(e)
			} catch (err) {
				bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage({ m: 'e', t: Date.now(), message: `bot.client.on('nq'): ${err}`})
			}
        })
		bot.client.on('notification', (e: any) => {
			try {
				let message = (e.html ?? e.text).split('<br>').map((g: string) => g.split('</br>')).flat()
				for (let m of message) {
					let g = m.trim()
					if (g.length <= 0)
						continue
					bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage({ m: 'j', t: Date.now(), message: m })
				}
			} catch (err) {
				bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage({ m: 'e', t: Date.now(), message: `bot.client.on('notification'): ${err}`})
			}
        })
		bot.client.on('wserror', (e: ErrorEvent) => {
			try {
				bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage({ m: 'e', t: Date.now(), message: `An error occured whilst attempting to connect: ${e.message}` })
			} catch (err) {
				bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage({ m: 'e', t: Date.now(), message: `bot.client.on('wserror'): ${err}`})
			}
        })
		bot.client.on('a', (msg: any) => bot.onMessage(msg))
        bot.player.on('midiEvent', (e: any) => {
			try {
				let ch = (e.channel ?? 0) % 16
				let color = bot.channelColors[ch]
				switch (e.type) {
					case 8: // note off
						var note = keys[e.note - 21]
						if (!note) 
							return
						if (constantSettings.player.noteQuota.enableWhenOffline) {
							if (constantSettings.player.noteQuota.enabled && bot.noteQuota.points <= constantSettings.player.noteQuota.threshold)
								return
						} else {
							if (bot.client.isConnected() && constantSettings.player.noteQuota.enabled && bot.noteQuota.points <= constantSettings.player.noteQuota.threshold)
								return
						}
						if (sustain)
							return
						try {
							if (bot.client.isConnected())
								bot.client.stopNote(note)
							if (synth)
								synthOutput.sendMessage([0x80, e.note, 0])
							bot.noteQuota.spend(1)
						} catch (err) {
							bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage({ m: 'e', t: Date.now(), message: `bot.player.on('midiEvent'): ${err}`})
						}
						break
					case 9: // note on
						if (e.velocity <= deblackVel)
							return
						if (constantSettings.player.noteQuota.enableWhenOffline) {
							if (constantSettings.player.noteQuota.enabled && bot.noteQuota.points <= constantSettings.player.noteQuota.threshold)
								return
						} else {
							if (bot.client.isConnected() && constantSettings.player.noteQuota.enabled && bot.noteQuota.points <= constantSettings.player.noteQuota.threshold)
								return
						}
						var note = keys[e.note - 21]
						if (!note) 
							return
						try {
							if (bot.client.isConnected())
								bot.client.startNote(note, (e.velocity / 127) * volume)
							if (synth)
								synthOutput.sendMessage([0x90, e.note, e.velocity])
							if (visualizer)
								visualizer.push(e.note - 21, color)
							bot.noteQuota.spend(1)
						} catch (err) {
							bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage({ m: 'e', t: Date.now(), message: `bot.player.on('midiEvent'): ${err}`})
						}
						break
				}
			} catch (err) {
				bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage({ m: 'e', t: Date.now(), message: `bot.player.on('midiEvent'): ${err}`})
			}
        })
		bot.player.on('endOfFile', (e: any) => {
			try {
				bot.send(bot.tags.success_mpp + 'The MIDI file has ended.')
			} catch (err) {
				bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage({ m: 'e', t: Date.now(), message: `bot.player.on('midiEvent'): ${err}`})
			}
        })
		bot.client.on('a', (e: any) => {
			try {
				bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage(e)
			} catch (err) {
				bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage({ m: 'e', t: Date.now(), message: `bot.client.on('a'): ${err}`})
			}
		})
		bot.client.on('n', (e: any) => {
			try {
				let off_a = e.t - bot.client.serverTimeOffset + 1000 - Date.now()
				let p = bot.client.findParticipantById(e.p)
				let color = parseInt(p.color.replace('#', ''), 16)
				for (let n of e.n) {
					let off_b = Math.max(off_a + (n.d || 0))
					if (off_b > 10000) continue
					if (off_b < 0) continue
					setTimeout(() => {
						try {
							let key = keys.indexOf(n.n)
							if (synth) {
								if (n.s == 1 || n.v == 0)
									synthOutput.sendMessage([0x80, key + 21, 0])
								else
									synthOutput.sendMessage([0x90, key + 21, Math.floor(n.v * 127)])
							}
							if (n.s != 1 && n.v != 0)
								visualizer.push(key, color)
						} catch (err) {
							bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage({ m: 'e', t: Date.now(), message: `bot.client.on('n'): ${err}`})
						}
					}, off_b)
				}
			} catch (err) {
				bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage({ m: 'e', t: Date.now(), message: `bot.client.on('n'): ${err}`})
			}
		})
		process.stdout.on('resize', () => {
			console.clear()
			bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage({ m: 's', w: process.stdout.columns, h: process.stdout.rows })
		})
		process.stdin.on('data', async b => {
			try {
				let text = bot.textDecoder.decode(b)
				switch (text) {
					case '\x03': // ctrl+c
						for (let t of bot.threads)
							t.worker.terminate()

						console.clear()
						process.exit()
					case '\x08': // backspace
					case '\x7f': // delete
						let a = bot.terminalInput.split('')
						a.pop()
						bot.terminalInput = a.join('')
						bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage({ m: 'i', t: Date.now(), i: bot.terminalInput })
						break
					case '\x20': // space
						bot.terminalInput += ' '
						bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage({ m: 'i', t: Date.now(), i: bot.terminalInput })
						break
					case '\x1b[A': // up
						if (bot.inputIndex <= 0)
							return
						bot.inputIndex -= 1
						bot.terminalInput = bot.inputHistory[bot.inputIndex] ?? ''
						bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage({ m: 'i', t: Date.now(), i: bot.terminalInput })
						break
					case '\x1b[B': // down
						if (bot.inputIndex >= bot.inputHistory.length - 1)
							return
						bot.inputIndex += 1
						bot.terminalInput = bot.inputHistory[bot.inputIndex] ?? ''
						bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage({ m: 'i', t: Date.now(), i: bot.terminalInput })
						break
					case '\n':
					case '\r':
					case '\r\n':
						if (bot.terminalInput.trim().length <= 0)
							return
						bot.client.isConnected() && !bot.client.isConnecting() ? bot.send(`\`\`\`[CONSOLE] ${bot.terminalInput}\`\`\``) : bot.send(bot.terminalInput)
						bot.onMessage({
							m: 'a',
							a: bot.terminalInput,
							p: {
								id: 'console',
								name: 'Console'
							}
						})
						bot.inputHistory.push(bot.terminalInput)
						bot.terminalInput = ''
						bot.inputIndex = bot.inputHistory.length
						bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage({ m: 'i', t: Date.now(), i: bot.terminalInput })
						await bot.db.push('data/volume', volume, true)
						await bot.db.push('data/sustain', sustain, true)
						await bot.db.push('data/deblackVel', deblackVel, true)
						await bot.db.push('data/synth', synth, true)
						break
					default:
						if (b[0] === 0x1b)
							return
						bot.terminalInput += text
						bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage({ m: 'i', t: Date.now(), i: bot.terminalInput })
						break
				}
			} catch (err) {
				bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage({ m: 'e', t: Date.now(), message: `process.stdout.on('data'): ${err}`})
			}
        })
		bot.threads.find((t: Thread) => t.name === 'chat').worker.postMessage({ m: 'l', t: Date.now(), message: 'Welcome to HyperBot!' })
    },
	findCommand: (t: string): Command => {
		let categories = Object.keys(bot.commands)
		let command: Command
		for (let g of categories) {
			let commands = bot.commands[g]
			command = commands.find((h: Command) => h.name === t || h.aliases.includes(t))
			if (command)
				break
		}
		return command
	},
	// listeners
	onMessage: async(msg: any) => {
		try {
			let a = msg.a.split(' '),
				b = a[0]?.trim() ?? '',
				c = a[1]?.trim() ?? '',
				d = a[2]? a[2].trim() : ''
			let input = msg.a.substring(b.length).trim()
			let str = b.slice(prefix.length).trim()
			if (msg.p.id !== bot.client.participantId) {
				let command = bot.findCommand(b.replace(prefix, ''))
				if (b.toLowerCase().startsWith(prefix)) {
					if (command) {
						!(await bot.db.exists(`/permissions/${msg.p.id}`)) && msg.p.id !== 'console' ? await bot.db.push(`/permissions/${msg.p.id}`, { commands: 0 }, false) : void 0
						if (msg.p.id !== 'console' && command.permission && !command.permission((await bot.db.getData(`/permissions/${msg.p.id}`)).commands)) 
							bot.send(bot.giveNoPermissionMessage())
						else {
							try {
								command.func(a, input, msg)
							} catch (err) {
								bot.send(bot.tags.failure_mpp + `\`\`\`${err}\`\`\``)
							}
						}
					} else bot.send(bot.tags.failure_mpp + `There is no command named \`${prefix}${str}\`.`)
				}
			}
			await bot.db.push('/settings/volume', volume, true)
			await bot.db.push('/settings/sustain', sustain, true)
			await bot.db.push('/settings/deblackVel', deblackVel, true)
			await bot.db.push('/settings/synth', synth, true)
		} catch (err) {
			bot.send(bot.tags.failure_mpp + `\`\`\`${err}\`\`\``)
		}
	}
}
var visualizer = new Visualizer(bot.threads.find((t: Thread) => t.name === 'visualizer'))
visualizer.start()
bot.init()