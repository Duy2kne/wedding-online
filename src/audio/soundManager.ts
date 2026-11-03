// Web Audio API Sound Synthesizer & Music Player for Wedding Applet
class SoundManager {
  private ctx: AudioContext | null = null;
  private musicAudio: HTMLAudioElement | null = null;
  private musicVolume = 0.5;
  private sfxVolume = 0.7;
  private isMuted = false;
  private analyser: AnalyserNode | null = null;
  private musicTracks: Array<{ title: string; url: string }> = [];
  private currentTrackIndex = 0;
  private isSynthesizingMusic = false;
  private synthInterval: any = null;

  constructor() {
    // Load persisted volume settings
    try {
      const savedMusicVol = localStorage.getItem('wedding_music_vol');
      if (savedMusicVol !== null) this.musicVolume = parseFloat(savedMusicVol);
      const savedSfxVol = localStorage.getItem('wedding_sfx_vol');
      if (savedSfxVol !== null) this.sfxVolume = parseFloat(savedSfxVol);
    } catch {
      // Ignore localStorage error
    }
  }

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 64;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public setMusicVolume(val: number) {
    this.musicVolume = Math.max(0, Math.min(1, val));
    if (this.musicAudio) {
      this.musicAudio.volume = this.musicVolume;
    }
    try {
      localStorage.setItem('wedding_music_vol', this.musicVolume.toString());
    } catch {}
  }

  public getMusicVolume(): number {
    return this.musicVolume;
  }

  public setSfxVolume(val: number) {
    this.sfxVolume = Math.max(0, Math.min(1, val));
    try {
      localStorage.setItem('wedding_sfx_vol', this.sfxVolume.toString());
    } catch {}
  }

  public getSfxVolume(): number {
    return this.sfxVolume;
  }

  // Synthesized wedding chords / music when no mp3 is provided
  private startSynthesizedMusic() {
    if (this.isSynthesizingMusic) return;
    this.isSynthesizingMusic = true;

    // Romantic wedding progression in D Major / G Major: D - A - Bm - F#m - G - D - G - A (Canon in D chords)
    const chordProgressions = [
      [293.66, 369.99, 440.0], // D Major
      [220.0, 277.18, 329.63], // A Major
      [246.94, 293.66, 369.99], // B Minor
      [185.0, 220.0, 277.18],  // F# Minor
      [196.0, 246.94, 293.66], // G Major
      [293.66, 369.99, 440.0], // D Major
      [196.0, 246.94, 293.66], // G Major
      [220.0, 277.18, 329.63], // A Major
    ];

    let chordIdx = 0;

    const playNextChord = () => {
      if (!this.isSynthesizingMusic || !this.ctx) return;
      const now = this.ctx.currentTime;
      const notes = chordProgressions[chordIdx % chordProgressions.length];
      chordIdx++;

      // Soft harp/piano synthesis
      notes.forEach((freq, i) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.12);

        // Soft envelope
        const vol = this.musicVolume * 0.12;
        gain.gain.setValueAtTime(0.001, now + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(vol, now + i * 0.12 + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 2.4);

        if (this.analyser) {
          gain.connect(this.analyser);
          this.analyser.connect(this.ctx!.destination);
        } else {
          gain.connect(this.ctx!.destination);
        }

        osc.connect(gain);
        osc.start(now + i * 0.12);
        osc.stop(now + i * 0.12 + 2.5);
      });
    };

    playNextChord();
    this.synthInterval = setInterval(playNextChord, 2600);
  }

  private stopSynthesizedMusic() {
    this.isSynthesizingMusic = false;
    if (this.synthInterval) {
      clearInterval(this.synthInterval);
      this.synthInterval = null;
    }
  }

  public setPlaylist(tracks: Array<{ title: string; url: string }>) {
    this.musicTracks = tracks;
  }

  public playMusic() {
    this.initContext();
    if (this.musicTracks.length > 0) {
      if (!this.musicAudio) {
        this.musicAudio = new Audio();
        this.musicAudio.crossOrigin = 'anonymous';
        this.musicAudio.addEventListener('ended', () => this.nextTrack());
      }
      this.stopSynthesizedMusic();
      const track = this.musicTracks[this.currentTrackIndex % this.musicTracks.length];
      this.musicAudio.src = track.url;
      this.musicAudio.volume = this.musicVolume;
      this.musicAudio.play().catch(() => {
        // Fallback to synthesized music if audio file load fails
        this.startSynthesizedMusic();
      });
    } else {
      this.startSynthesizedMusic();
    }
  }

  public pauseMusic() {
    if (this.musicAudio) {
      this.musicAudio.pause();
    }
    this.stopSynthesizedMusic();
  }

  public nextTrack() {
    if (this.musicTracks.length === 0) return;
    this.currentTrackIndex = (this.currentTrackIndex + 1) % this.musicTracks.length;
    this.playMusic();
  }

  public prevTrack() {
    if (this.musicTracks.length === 0) return;
    this.currentTrackIndex = (this.currentTrackIndex - 1 + this.musicTracks.length) % this.musicTracks.length;
    this.playMusic();
  }

  // Sound Effects Synthesis
  public playToastCheers() {
    this.initContext();
    if (!this.ctx || this.sfxVolume <= 0) return;
    const now = this.ctx.currentTime;

    // High crystalline glass clink "keng!"
    [2400, 3200, 4800].forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.04);
      gain.gain.setValueAtTime(this.sfxVolume * 0.4, now + idx * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.8);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(now + idx * 0.04);
      osc.stop(now + idx * 0.04 + 0.85);
    });
  }

  // ---------- Tiếng vỗ tay ----------
  private noiseBuffer: AudioBuffer | null = null;
  private clappers = new Map<string, { volume: number; timer: ReturnType<typeof setInterval>; until: number }>();

  /** Mở khoá âm thanh (gọi trong sự kiện chạm/bấm đầu tiên, bắt buộc trên iPhone) */
  public unlock() {
    this.initContext();
  }

  private getNoise(): AudioBuffer | null {
    if (!this.ctx) return null;
    if (!this.noiseBuffer) {
      const len = Math.floor(this.ctx.sampleRate * 0.25);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
    }
    return this.noiseBuffer;
  }

  /** Một tiếng "bộp" của 2 lòng bàn tay: nhiễu trắng ngắn qua lọc dải + tắt nhanh */
  private clapAt(t: number, volume: number) {
    const ctx = this.ctx;
    const noise = this.getNoise();
    if (!ctx || !noise || volume <= 0) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1100 + Math.random() * 900;
    band.Q.value = 0.9 + Math.random() * 0.6;
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 450;
    const gain = ctx.createGain();
    const peak = this.sfxVolume * volume * (0.75 + Math.random() * 0.25);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.002);
    // 2 lớp tắt dần: tiếng "bốp" chính + chút vang phòng
    gain.gain.exponentialRampToValueAtTime(peak * 0.25, t + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    src.connect(band);
    band.connect(high);
    high.connect(gain);
    gain.connect(ctx.destination);
    src.start(t, Math.random() * 0.1, 0.14);
  }

  /** Một người vỗ tay đều tay (key = id nhân vật). Gọi lại để cập nhật âm lượng theo khoảng cách. */
  public startClapping(key: string, volume = 1) {
    this.initContext();
    if (!this.ctx) return;
    const existing = this.clappers.get(key);
    if (existing) {
      existing.volume = volume;
      return;
    }
    const entry = { volume, until: Date.now() + 15000, timer: 0 as unknown as ReturnType<typeof setInterval> };
    // Nhịp ~3.2 lần/giây, khớp với hoạt ảnh vỗ tay của nhân vật
    const beat = 0.31;
    let next = this.ctx.currentTime + 0.05;
    const schedule = () => {
      if (!this.ctx) return;
      if (Date.now() > entry.until) {
        this.stopClapping(key);
        return;
      }
      while (next < this.ctx.currentTime + 0.35) {
        this.clapAt(next, entry.volume);
        next += beat + (Math.random() - 0.5) * 0.03;
      }
    };
    schedule();
    entry.timer = setInterval(schedule, 120);
    this.clappers.set(key, entry);
  }

  public stopClapping(key: string) {
    const c = this.clappers.get(key);
    if (!c) return;
    clearInterval(c.timer);
    this.clappers.delete(key);
  }

  public isClapping(key: string) {
    return this.clappers.has(key);
  }

  /** Cả hội trường vỗ tay (tung hoa, chúc mừng...): nhiều người vỗ lệch nhịp, to dần rồi nhỏ dần */
  public playApplause(duration = 3) {
    this.initContext();
    if (!this.ctx || this.sfxVolume <= 0) return;
    const now = this.ctx.currentTime;
    const people = 14;
    for (let p = 0; p < people; p++) {
      const rate = 0.2 + Math.random() * 0.12; // mỗi người một nhịp riêng
      let t = now + Math.random() * 0.3;
      while (t < now + duration) {
        const k = (t - now) / duration;
        const env = Math.min(1, k * 5) * Math.min(1, (1 - k) * 2.5); // to dần rồi nhỏ dần
        this.clapAt(t, 0.32 * env);
        t += rate + (Math.random() - 0.5) * 0.05;
      }
    }
  }

  public playPointsDing() {
    this.initContext();
    if (!this.ctx || this.sfxVolume <= 0) return;
    const now = this.ctx.currentTime;
    // Sweet bright "ting" chime
    [1046.5, 1318.51, 1567.98].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.06);
      gain.gain.setValueAtTime(this.sfxVolume * 0.35, now + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.7);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.75);
    });
  }

  public playConfettiPop() {
    this.initContext();
    if (!this.ctx || this.sfxVolume <= 0) return;
    const now = this.ctx.currentTime;
    // Champagne cork pop sound
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(450, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.12);
    gain.gain.setValueAtTime(this.sfxVolume * 0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }
}

export const soundManager = new SoundManager();
