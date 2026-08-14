/* chart.js — 无依赖 Canvas 折线图（S7 图表组件）。
 * 单线霓虹青净值 + 可选基准复利虚线 + 图例/坐标轴/缩放/悬停读数/区间切换/回撤阴影。 */
(function (global) {
  'use strict';

  function fmt(v, dp) {
    if (v == null || !isFinite(v)) return '-';
    return Number(v).toFixed(dp == null ? 2 : dp);
  }

  class LineChart {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.dates = [];
      this.series = [];
      this.visible = {};
      this.view = null;       // {start, end} index range, null = all
      this.mouse = null;      // {x, y} CSS px
      this.showDrawdown = false;
      this.drag = null;       // {startX, view0}
      this.dpr = (global.devicePixelRatio || 1);
      this._bind();
    }

    setData(dates, series) {
      this.dates = dates;
      this.series = series;
      this.visible = {};
      for (const s of series) this.visible[s.name] = true;
      this.view = null;
      this.draw();
    }

    setRange(range) {
      const n = this.dates.length;
      if (range === '1y') this.view = { start: Math.max(0, n - 252), end: n - 1 };
      else if (range === '3y') this.view = { start: Math.max(0, n - 756), end: n - 1 };
      else this.view = null;
      this.draw();
    }

    setVisible(name, on) { if (name in this.visible) { this.visible[name] = on; this.draw(); } }
    setDrawdown(on) { this.showDrawdown = on; this.draw(); }

    _bind() {
      const c = this.canvas;
      c.addEventListener('mousemove', (e) => { this.mouse = { x: e.offsetX, y: e.offsetY }; this.draw(); });
      c.addEventListener('mouseleave', () => { this.mouse = null; this.draw(); });
      c.addEventListener('mousedown', (e) => { this.drag = { startX: e.offsetX, view0: this.view ? { ...this.view } : null }; });
      global.addEventListener('mouseup', () => { this.drag = null; });
      c.addEventListener('mousemove', (e) => {
        if (this.drag) {
          const n = this.dates.length;
          const v0 = this.drag.view0 ? this.drag.view0.start : 0;
          const v1 = this.drag.view0 ? this.drag.view0.end : n - 1;
          const span = v1 - v0;
          const pad = this._pad();
          const w = this._width();
          const plotW = w - pad.left - pad.right;
          const dx = (e.offsetX - this.drag.startX) / plotW * span;
          const start = Math.max(0, Math.min(n - 1 - span, Math.round(v0 - dx)));
          this.view = { start, end: start + span };
          this.draw();
        }
      });
      c.addEventListener('wheel', (e) => {
        e.preventDefault();
        const n = this.dates.length;
        const pad = this._pad();
        const w = this._width();
        const plotW = w - pad.left - pad.right;
        const cur = this.view || { start: 0, end: n - 1 };
        const span = cur.end - cur.start;
        const factor = e.deltaY > 0 ? 1.25 : 0.8;
        const newSpan = Math.max(20, Math.min(n - 1, Math.round(span * factor)));
        const cx = (e.offsetX - pad.left) / plotW; // 0..1 in plot
        const anchor = cur.start + cx * span;
        const start = Math.max(0, Math.min(n - 1 - newSpan, Math.round(anchor - cx * newSpan)));
        this.view = { start, end: start + newSpan };
        this.draw();
      }, { passive: false });
      c.addEventListener('dblclick', () => { this.view = null; this.draw(); });
      const ro = new ResizeObserver(() => this.draw());
      ro.observe(c);
    }

    _width() { return this.canvas.clientWidth || this.canvas.parentElement.clientWidth || 800; }
    _height() { return this.canvas.clientHeight || 320; }
    _pad() { return { left: 64, right: 18, top: 16, bottom: 26 }; }

    _visibleSeries() { return this.series.filter((s) => this.visible[s.name] !== false); }

    _yDomain() {
      const [v0, v1] = this._range();
      let lo = Infinity, hi = -Infinity;
      for (const s of this._visibleSeries()) {
        for (let i = v0; i <= v1; i++) {
          const v = s.values[i];
          if (v != null && isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
        }
      }
      if (!isFinite(lo)) { lo = 0; hi = 1; }
      const pad = (hi - lo) * 0.06 || 0.1;
      return { lo: lo - pad, hi: hi + pad };
    }

    _range() {
      const n = this.dates.length;
      if (!n) return [0, 0];
      if (this.view) return [this.view.start, this.view.end];
      return [0, n - 1];
    }

    draw() {
      const c = this.canvas;
      const w = this._width();
      const h = this._height();
      if (!w || !h) return;
      const dpr = this.dpr;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      const ctx = this.ctx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const pad = this._pad();
      const plotW = w - pad.left - pad.right;
      const plotH = h - pad.top - pad.bottom;
      const [v0, v1] = this._range();
      const { lo, hi } = this._yDomain();
      const x = (i) => pad.left + (v1 === v0 ? 0 : (i - v0) / (v1 - v0)) * plotW;
      const y = (val) => pad.top + (1 - (val - lo) / (hi - lo)) * plotH;

      // grid + y labels
      ctx.strokeStyle = 'rgba(120,140,170,0.15)';
      ctx.fillStyle = 'rgba(160,180,210,0.75)';
      ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const yTicks = 5;
      for (let k = 0; k <= yTicks; k++) {
        const val = lo + (hi - lo) * k / yTicks;
        const yy = y(val);
        ctx.beginPath(); ctx.moveTo(pad.left, yy); ctx.lineTo(w - pad.right, yy); ctx.stroke();
        ctx.fillText(fmt(val, 2), pad.left - 8, yy);
      }
      // x labels
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const xTicks = Math.min(6, v1 - v0 + 1);
      for (let k = 0; k <= xTicks; k++) {
        const i = Math.round(v0 + (v1 - v0) * k / Math.max(1, xTicks));
        const xx = x(i);
        ctx.beginPath(); ctx.moveTo(xx, pad.top); ctx.lineTo(xx, h - pad.bottom); ctx.stroke();
        if (this.dates[i]) ctx.fillText(this.dates[i].slice(2), xx, h - pad.bottom + 5);
      }

      // drawdown shading (optional)
      if (this.showDrawdown && this.series.length) {
        const primary = this.series[0].values;
        let peak = -Infinity;
        const dd = [];
        for (let i = 0; i < primary.length; i++) {
          const v = primary[i];
          if (v != null && v > peak) peak = v;
          dd.push(peak > 0 && v != null ? v < peak : false);
        }
        ctx.fillStyle = 'rgba(255,80,80,0.10)';
        ctx.beginPath();
        let started = false;
        for (let i = v0; i <= v1; i++) {
          if (dd[i]) {
            if (!started) { ctx.moveTo(x(i), pad.top); started = true; }
            ctx.lineTo(x(i), y(primary[i]));
          } else if (started) {
            ctx.lineTo(x(i), pad.top); started = false;
          }
        }
        if (started) ctx.lineTo(x(v1), pad.top);
        ctx.lineTo(x(v0), pad.top);
        ctx.closePath();
        ctx.fill();
      }

      // series lines
      for (const s of this._visibleSeries()) {
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width || 1.5;
        ctx.setLineDash(s.dashed ? [5, 4] : []);
        ctx.beginPath();
        let started = false;
        for (let i = v0; i <= v1; i++) {
          const v = s.values[i];
          if (v == null || !isFinite(v)) { started = false; continue; }
          if (!started) { ctx.moveTo(x(i), y(v)); started = true; }
          else ctx.lineTo(x(i), y(v));
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // legend
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      let lx = pad.left + 4;
      const ly = pad.top + 4;
      for (const s of this.series) {
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;
        ctx.setLineDash(s.dashed ? [5, 4] : []);
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 22, ly); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = this.visible[s.name] !== false ? 'rgba(220,235,255,0.9)' : 'rgba(120,130,150,0.6)';
        ctx.fillText(s.name, lx + 28, ly);
        lx += 28 + ctx.measureText(s.name).width + 26;
      }

      // hover
      if (this.mouse && this.dates.length) {
        const mx = this.mouse.x;
        if (mx >= pad.left && mx <= w - pad.right) {
          const i = Math.round(v0 + (mx - pad.left) / plotW * (v1 - v0));
          const ii = Math.max(v0, Math.min(v1, i));
          const xx = x(ii);
          ctx.strokeStyle = 'rgba(180,200,230,0.35)';
          ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(xx, pad.top); ctx.lineTo(xx, h - pad.bottom); ctx.stroke();
          ctx.setLineDash([]);
          // tooltip
          const rows = [this.dates[ii]];
          for (const s of this._visibleSeries()) {
            const v = s.values[ii];
            rows.push(s.name + ': ' + fmt(v, 4));
          }
          ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
          const tw = Math.max(...rows.map((r) => ctx.measureText(r).width)) + 16;
          const th = rows.length * 15 + 10;
          let bx = xx + 12;
          if (bx + tw > w - 4) bx = xx - tw - 12;
          const by = Math.max(4, Math.min(h - th - 4, this.mouse.y - th / 2));
          ctx.fillStyle = 'rgba(10,16,28,0.92)';
          ctx.strokeStyle = 'rgba(120,160,220,0.4)';
          ctx.fillRect(bx, by, tw, th);
          ctx.strokeRect(bx, by, tw, th);
          ctx.fillStyle = 'rgba(210,230,255,0.95)';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          rows.forEach((r, k) => ctx.fillText(r, bx + 8, by + 6 + k * 15));
        }
      }
    }
  }

  global.LineChart = LineChart;
})(typeof globalThis !== 'undefined' ? globalThis : this);
