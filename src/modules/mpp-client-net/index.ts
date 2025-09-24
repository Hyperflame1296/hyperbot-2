import { EventEmitter } from "node:events";
import { WebSocket } from "ws";
import {
    ChannelInfo,
    Participant,
    User,
    LoginInfo,
    AccountInfo,
    Note,
    ChannelSettings,
    EmittableEvents,
    IncomingEvents,
    OutgoingEvents,
    LocalEvents,
    LoginType,
    NoteLetter,
    NoteOctave,
    Tag
} from "./types.js";

export class Client extends EventEmitter {
    public ws: WebSocket | undefined;
    public serverTimeOffset = 0;
    public user: User | undefined;
    public participantId: Participant["id"] | undefined;
    public channel: ChannelInfo | undefined;
    public ppl: Record<Participant["id"], Participant> = {};
    public connectionTime: number | undefined;
    public connectionAttempts = 0;
    public desiredChannelId: ChannelInfo["_id"] | undefined;
    public desiredChannelSettings: Partial<ChannelSettings> | undefined;
    public pingInterval: NodeJS.Timeout | undefined;
    public canConnect = false;
    public noteBuffer: Note[] = [];
    public noteBufferTime = 0;
    public noteFlushInterval: NodeJS.Timeout | undefined;
    public permissions: any = {};
    public "🐈": number = 0;
    public loginInfo: LoginInfo | undefined;
    public accountInfo: AccountInfo | undefined;

    constructor(public uri: string, public token?: string) {
        super();

        this.bindEventListeners();
        this.emit("status", "(Offline mode)");
    }

    public isSupported() {
        return typeof WebSocket === "function";
    }

    public isConnected() {
        return (
            this.isSupported() &&
            this.ws &&
            this.ws.readyState === WebSocket.OPEN
        );
    }

    public isConnecting() {
        return (
            this.isSupported() &&
            this.ws &&
            this.ws.readyState === WebSocket.CONNECTING
        );
    }

    public start() {
        this.canConnect = true;
        if (!this.connectionTime) {
            this.connect();
        }
    }

    public stop() {
        this.canConnect = false;
        if (this.ws) this.ws.close();
    }

    public connect() {
        if (
            !this.canConnect ||
            !this.isSupported() ||
            this.isConnected() ||
            this.isConnecting()
        )
            return;

        this.emit("status", "Connecting...");
        if (typeof process !== "undefined") {
            // nodejsicle
            this.ws = new WebSocket(this.uri, {
                origin: "https://multiplayerpiano.net"
            });
        } else {
            // browseroni
            this.ws = new WebSocket(this.uri);
        }

        this.ws.addEventListener("close", evt => {
            this.user = undefined;
            this.participantId = undefined;
            this.channel = undefined;
            this.setParticipants([]);
            clearInterval(this.pingInterval);
            clearInterval(this.noteFlushInterval);

            this.emit("disconnect", evt);
            this.emit("status", "Offline mode");

            // reconnect!
            if (this.connectionTime) {
                this.connectionTime = undefined;
                this.connectionAttempts = 0;
            } else {
                ++this.connectionAttempts;
            }

            const ms_lut = [50, 2500, 10000];
            let idx = this.connectionAttempts;
            if (idx >= ms_lut.length) idx = ms_lut.length - 1;
            const ms = ms_lut[idx];

            setTimeout(this.connect.bind(this), ms);
        });

        this.ws.addEventListener("error", err => {
            this.emit("wserror", err)
            if (this.ws) this.ws.close(); // self.ws.emit("close");
        });

        this.ws.addEventListener("open", evt => {
            this.pingInterval = setInterval(() => {
                this.sendPing();
            }, 20000);

            this.noteBuffer = [];
            this.noteBufferTime = 0;

            this.noteFlushInterval = setInterval(() => {
                if (this.noteBufferTime && this.noteBuffer.length > 0) {
                    this.sendArray([
                        {
                            m: "n",
                            t: this.noteBufferTime + this.serverTimeOffset,
                            n: this.noteBuffer
                        }
                    ]);
                    this.noteBufferTime = 0;
                    this.noteBuffer = [];
                }
            }, 200);

            this.emit("connect", undefined);
            this.emit("status", "Joining channel...");

            this.sendArray([
                {
                    m: "hi",
                    token: this.token,
                    login: this.loginInfo
                }
            ]);
        });

        this.ws.addEventListener("message", async evt => {
            const transmission = JSON.parse(
                (evt as unknown as { data: string }).data
            );

            for (let i = 0; i < transmission.length; i++) {
                const msg = transmission[i];
                this.emit(msg.m, msg);
            }
        });
    }

    protected bindEventListeners() {
        this.on("hi", msg => {
            this.connectionTime = Date.now();
            this.user = msg.u;
            this.receiveServerTime(msg.t, msg.e);

            if (this.desiredChannelId) {
                this.setChannel();
            }

            this.permissions = msg.permissions ? msg.permissions : {};
            this.accountInfo = msg.accountInfo;
        });

        this.on("t", msg => {
            this.receiveServerTime(msg.t, msg.e || undefined);
        });

        this.on("ch", msg => {
            this.desiredChannelId = msg.ch._id;
            this.desiredChannelSettings = msg.ch.settings;

            this.channel = msg.ch;

            if (msg.p) this.participantId = msg.p;
            this.setParticipants(msg.ppl);
        });

        this.on("p", msg => {
            this.participantUpdate(msg);
            this.emit(
                "participant update",
                this.findParticipantById(msg.id) as Participant
            );
        });

        this.on("m", msg => {
            if (this.ppl.hasOwnProperty(msg.id)) {
                this.participantMoveMouse(msg);
            }
        });

        this.on("bye", msg => {
            this.removeParticipant(msg.p);
        });
    }

    protected send(raw: string) {
        if (this.isConnected() && this.ws) this.ws.send(raw);
    }

    public sendArray<Event extends keyof OutgoingEvents>(
        arr: OutgoingEvents[Event][]
    ) {
        this.send(JSON.stringify(arr));
    }

    public setChannel(id?: string, set?: Partial<ChannelSettings>) {
        this.desiredChannelId = id || this.desiredChannelId || "lobby";
        this.desiredChannelSettings =
            set || this.desiredChannelSettings || undefined;

        this.sendArray([
            {
                m: "ch",
                _id: this.desiredChannelId,
                set: this.desiredChannelSettings
            }
        ]);
    }

    protected offlineChannelSettings: Partial<ChannelSettings> = {
        color: "#ecfaed"
    };

    public getChannelSetting(key: string) {
        if (!this.isConnected() || !this.channel || !this.channel.settings) {
            return this.offlineChannelSettings[key];
        }

        return this.channel.settings[key];
    }

    public setChannelSettings(settings: Partial<ChannelSettings>) {
        if (!this.isConnected() || !this.channel || !this.channel.settings) {
            return;
        }

        if (this.desiredChannelSettings) {
            for (const key of Object.keys(settings)) {
                this.desiredChannelSettings[key] = settings[key];
            }

            this.sendArray([
                {
                    m: "chset",
                    set: this.desiredChannelSettings
                }
            ]);
        }
    }

    protected offlineParticipant = {
        _id: "",
        name: "",
        color: "#777"
    };

    public getOwnParticipant() {
        return this.findParticipantById(this.participantId);
    }

    protected setParticipants(ppl: Participant[]) {
        // remove participants who left
        for (const id of Object.keys(this.ppl)) {
            if (!this.ppl.hasOwnProperty(id)) continue;

            let found = false;

            for (let j = 0; j < ppl.length; j++) {
                if (ppl[j].id === id) {
                    found = true;
                    break;
                }
            }

            if (!found) {
                this.removeParticipant(id);
            }
        }

        // update all
        for (let i = 0; i < ppl.length; i++) {
            this.participantUpdate(ppl[i]);
        }
    }

    public countParticipants() {
        let count = 0;

        for (let i in this.ppl) {
            if (this.ppl.hasOwnProperty(i)) ++count;
        }

        return count;
    }

    public participantUpdate(update: any) {
        let part = this.ppl[update.id] || null;

        if (part === null) {
            part = update;
            this.ppl[part.id] = part;

            this.emit("participant added", part);
            this.emit("count", this.countParticipants());
        } else {
            Object.keys(update).forEach(key => {
                (part as Record<string, any>)[key] = update[key];
            });

            if (!update.tag) delete part.tag;
            if (!update.vanished) delete part.vanished;
        }
    }

    public participantMoveMouse(update: IncomingEvents["m"]) {
        const part = this.ppl[update.id] || null;

        if (part !== null) {
            part.x = update.x;
            part.y = update.y;
        }
    }

    public removeParticipant(id: Participant["id"]) {
        if (this.ppl.hasOwnProperty(id)) {
            const part = this.ppl[id];
            delete this.ppl[id];

            this.emit("participant removed", part);
            this.emit("count", this.countParticipants());
        }
    }

    public findParticipantById(id?: string) {
        return id
            ? this.ppl[id] || this.offlineParticipant
            : this.offlineParticipant;
    }

    public isOwner() {
        return (
            this.channel &&
            this.channel.crown &&
            this.channel.crown.participantId === this.participantId
        );
    }

    public preventsPlaying() {
        return (
            this.isConnected() &&
            !this.isOwner() &&
            this.getChannelSetting("crownsolo") === true &&
            !this.permissions.playNotesAnywhere
        );
    }

    public receiveServerTime(time: number, echo?: number) {
        const now = Date.now();
        const target = time - now;

        // console.log("Target serverTimeOffset: " + target);
        const duration = 1000;

        let step = 0;
        const steps = 50;
        const step_ms = duration / steps;

        const difference = target - this.serverTimeOffset;
        const inc = difference / steps;

        let iv = setInterval(() => {
            this.serverTimeOffset += inc;

            if (++step >= steps) {
                clearInterval(iv);
                // console.log("serverTimeOffset reached: " + self.serverTimeOffset);
                this.serverTimeOffset = target;
            }
        }, step_ms);
        // smoothen

        // this.serverTimeOffset = time - now;            // mostly time zone offset ... also the lags so todo smoothen this
        // not smooth:
        // if(echo) this.serverTimeOffset += echo - now;    // mostly round trip time offset
    }

    public startNote(note: Note["n"], vel: Note["v"]) {
        if (typeof note !== "string") return;

        if (this.isConnected()) {
            let vel2 = typeof vel === "undefined" ? undefined : +vel.toFixed(3);

            if (!this.noteBufferTime) {
                this.noteBufferTime = Date.now();
                this.noteBuffer.push({
                    n: note,
                    v: vel2
                });
            } else {
                this.noteBuffer.push({
                    d: Date.now() - this.noteBufferTime,
                    n: note,
                    v: vel2
                });
            }
        }
    }

    public stopNote(note: Note["n"]) {
        if (typeof note !== "string") return;

        if (this.isConnected()) {
            if (!this.noteBufferTime) {
                this.noteBufferTime = Date.now();
                this.noteBuffer.push({ n: note, s: 1 });
            } else {
                this.noteBuffer.push({
                    d: Date.now() - this.noteBufferTime,
                    n: note,
                    s: 1
                });
            }
        }
    }

    public sendPing() {
        this.sendArray([
            {
                m: "t",
                e: Date.now()
            }
        ]);
    }

    public setLoginInfo(loginInfo: LoginInfo) {
        this.loginInfo = loginInfo;
    }

    public on<Event extends keyof EmittableEvents>(
        event: Event,
        listener: (msg: EmittableEvents[Event]) => void
    ): this {
        super.on(event, listener);
        return this;
    }

    public emit<Event extends keyof EmittableEvents>(
        event: Event,
        ...args: Parameters<(msg: EmittableEvents[Event]) => void>
    ): boolean {
        try {
            super.emit(event, ...args);
            return true;
        } catch (err) {
            return false;
        }
    }

    public sendChat(message: string) {
        this.sendArray([{
            m: "a",
            message
        }]);
    }

    public chown(id?: Participant["id"]) {
        this.sendArray([{
            m: "chown",
            id: id
        }]);
    }

    public setName(name: string) {
        this.sendArray([{
            m: "userset",
            set: {
                name
            }
        }]);
    }

    public setColor(color: string) {
        this.sendArray([{
            m: "userset",
            set: {
                color
            }
        }]);
    }

    public userset(set: Partial<{ name: string, color: string }>) {
        this.sendArray([{
            m: "userset",
            set
        }]);
    }

    public setCursor(x: number | string, y: number | string) {
        if (typeof x === "number") x = x.toFixed(2);
        if (typeof y === "number") y = y.toFixed(2);

        this.sendArray([{
            m: "m",
            x,
            y
        }]);
    }

    public chset(set: Partial<ChannelSettings>) {
        this.sendArray([{
            m: "chset",
            set
        }]);
    }
}

export default Client;

export {
    ChannelInfo,
    Participant,
    User,
    LoginInfo,
    AccountInfo,
    Note,
    ChannelSettings,
    EmittableEvents,
    IncomingEvents,
    OutgoingEvents,
    LocalEvents,
    LoginType,
    NoteLetter,
    NoteOctave,
    Tag
};