class NoteQuota {
	// allowance and maxHistLen are unused but kept for backwards compatibility
	static PARAMS_LOBBY = { allowance: 200, max: 600, maxHistLen: 3 };
	static PARAMS_NORMAL = { allowance: 400, max: 1200, maxHistLen: 3 };
	static PARAMS_RIDICULOUS = { allowance: 600, max: 1800, maxHistLen: 3 };
	static PARAMS_OFFLINE = { allowance: 8000, max: 24000, maxHistLen: 3 };
	static PARAMS_UNLIMITED = { allowance: 1000000, max: 3000000, maxHistLen: 3 };
	static PARAMS_INFINITE = { allowance: Infinity, max: Infinity, maxHistLen: 3 };

	#points = 0;
	#cachedPoints = 0;
	#regenRate = 0; // pts/ms; dynamic based on max
	#cacheTimestamp = 0; // 0 = invalid
	#lastUpdateTimestamp = 0;
	#hasCalledTick = false; // for migration

	#recalc(timestamp) {
		const timeElapsed = timestamp - this.#lastUpdateTimestamp;
		const regeneratedPoints = timeElapsed > 0 ? timeElapsed * this.#regenRate : 0;
		return Math.min(this.#points + regeneratedPoints, this.max);
	}

	constructor(cb, params) {
		this.cb = cb;
		this.max = 0;

		this.CACHE_DURATION_MS = 10;

		this.setParams(params);
	}

	get points() {
		const now = Date.now();

		if (this.#cacheTimestamp > 0 && now - this.#cacheTimestamp < this.CACHE_DURATION_MS) {
			return this.#cachedPoints;
		}

		const currentPoints = this.#recalc(now);

		// prime cache
		this.#cachedPoints = currentPoints;
		this.#cacheTimestamp = now;

		return currentPoints;
	}

	getParams() {
		return {
			m: "nq",
			allowance: this.max / 3,
			max: this.max,
			maxHistLen: 3
		};
	}

	setParams(params) {
		params = params || NoteQuota.PARAMS_OFFLINE;
		const max = params.max || this.max || NoteQuota.PARAMS_OFFLINE.max;

		if (max !== this.max) {
			this.max = max;
			this.#regenRate = max / 6000;
			this.resetPoints();
			return true;
		}
		return false;
	}

	resetPoints() {
		this.#points = this.max;
		this.#lastUpdateTimestamp = Date.now();

		// invalidate cache
		// priming would also work, but this is rarely called, so it is acceptable
		this.#cacheTimestamp = 0;

		if (this.cb) this.cb(this.points);
	}

	spend(needed) {
		const now = Date.now();
		
		// saves a Date.now() call over just using this.points
		const currentPoints = this.#recalc(now);

		if (currentPoints < needed) return false;

		this.#points = currentPoints - needed;
		this.#lastUpdateTimestamp = now;

		// prime cache
		this.#cachedPoints = this.#points;
		this.#cacheTimestamp = now;

		if (this.cb) this.cb(this.#points);
		return true;
	}

	// legacy
	tick() {
		if (this.#hasCalledTick) return;
		console.warn("NoteQuota#tick() is deprecated and no longer has any effect. You can safely remove the timer to improve performance.");
		this.#hasCalledTick = true;
	}

	get allowance() {
		return this.max / 3;
	}

	get maxHistLen() {
		return 3;
	}

	get history() {
		const p = this.points;
		return [p, p, p];
	}
}
export {
	NoteQuota
}