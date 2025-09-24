import { Subcommand } from './Subcommand.js'

interface Command {
    name: string
    desc: string
    syntax: string
    aliases: string[]
    subcommands?: Subcommand[]
    permission?: (p: number) => boolean
    func: (a: string[], input: string, msg: any) => any
}
export {
    Command
}