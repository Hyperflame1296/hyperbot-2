class Interval {
    name: string
    timeout: NodeJS.Timeout
    intervalLength: number
    constructor(name: string = '', intervalLength: number = 0, update=function() {}) {
        this.name = name
        this.intervalLength = intervalLength
        this.update = update
    }
    start() {
		if (this.timeout)
			this.stop()
		return this.timeout = setInterval(this.update, this.intervalLength)
    }
    update() {

    }
    stop() {
        if (!this.timeout)
            return
        
        this.timeout.close()
        this.timeout = undefined
    }
}
export {
    Interval
}