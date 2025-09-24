interface Subcommand {
    name: string
    desc: string
    syntax: string
    permission?: (p: number) => boolean
    func: (a: string[], input: string, msg: any) => any
}
export {
    Subcommand
}