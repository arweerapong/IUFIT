/* pp-qr.js — QR encoder (byte mode, EC M) พอร์ตจาก src/lib/qr.ts สำหรับ LINE OA billing */
(function (w) {
'use strict';
/* ------------------------------- GF(256) ---------------------------------- */
const EXP = new Array(512)
const LOG = new Array(256)
;(() => {
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]
})()

function gmul(a, b) {
  if (a === 0 || b === 0) return 0
  return EXP[LOG[a] + LOG[b]]
}
function rsGen(d) {
  let g = [1]
  for (let i = 0; i < d; i++) {
    const ng = new Array(g.length + 1).fill(0)
    for (let j = 0; j < g.length; j++) {
      ng[j] ^= gmul(g[j], EXP[i])
      ng[j + 1] ^= g[j]
    }
    g = ng
  }
  return g.reverse()
}
function rsEnc(data, ec) {
  const gen = rsGen(ec)
  const res = new Array(ec).fill(0)
  for (let i = 0; i < data.length; i++) {
    const f = data[i] ^ res[0]
    res.shift()
    res.push(0)
    if (f !== 0) for (let j = 0; j < ec; j++) res[j] ^= gmul(gen[j + 1], f)
  }
  return res
}

/** EC-M table v1..10: [ecPerBlock, [[numBlocks, dataPerBlock], …]] */
const ECM = {
  1: [10, [[1, 16]]],
  2: [16, [[1, 28]]],
  3: [26, [[1, 44]]],
  4: [18, [[2, 32]]],
  5: [24, [[2, 43]]],
  6: [16, [[4, 27]]],
  7: [18, [[4, 31]]],
  8: [22, [[2, 38], [2, 39]]],
  9: [22, [[3, 36], [2, 37]]],
  10: [26, [[4, 43], [1, 44]]],
}
const ALIGN = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
}

function totalData(v) {
  return ECM[v][1].reduce((s, [nb, dp]) => s + nb * dp, 0)
}

/** UTF-8 bytes (blob ใช้ `unescape(encodeURIComponent(s))` — ผลลัพธ์เดียวกัน) */
function bytesOf(str) {
  if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(str))
  const u = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, h) =>
    String.fromCharCode(parseInt(h, 16)),
  )
  const out = []
  for (let i = 0; i < u.length; i++) out.push(u.charCodeAt(i) & 0xff)
  return out
}

function maskF(mk, r, c) {
  switch (mk) {
    case 0: return (r + c) % 2 === 0
    case 1: return r % 2 === 0
    case 2: return c % 3 === 0
    case 3: return (r + c) % 3 === 0
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0
    default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
  }
}
function fmtBits(ecl, mk) {
  const data = (ecl << 3) | mk
  let rem = data
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) & 1 ? 0x537 : 0)
  return ((data << 10) | rem) ^ 0x5412
}

/** เมทริกซ์โมดูล QR (1 = ดำ) — พอร์ตตรงจาก IUQR.matrix */
function qrMatrix(text) {
  const data = bytesOf(text)
  let v = 0
  for (let k = 1; k <= 10; k++) {
    const cap = totalData(k)
    const ccBits = k >= 10 ? 16 : 8
    const need = Math.ceil((4 + ccBits + data.length * 8) / 8)
    if (need <= cap) {
      v = k
      break
    }
  }
  if (!v) throw new Error('qr: text too long')
  const cc = v >= 10 ? 16 : 8

  /* --- bit buffer --- */
  const bits = []
  const put = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1)
  }
  put(4, 4) // byte mode
  put(data.length, cc)
  for (const b of data) put(b, 8)
  const capBits = totalData(v) * 8
  if (bits.length + 4 <= capBits) put(0, 4)
  else while (bits.length < capBits) bits.push(0)
  while (bits.length % 8 !== 0) bits.push(0)

  const dcw = []
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]
    dcw.push(b)
  }
  const pad = [0xec, 0x11]
  let pi = 0
  while (dcw.length < totalData(v)) {
    dcw.push(pad[pi & 1])
    pi++
  }

  /* --- blocks + interleave --- */
  const ec = ECM[v][0]
  const groups = ECM[v][1]
  const blocks = []
  const ecblocks = []
  let idx = 0
  for (const [nb, dp] of groups) {
    for (let b = 0; b < nb; b++) {
      const d = dcw.slice(idx, idx + dp)
      idx += dp
      blocks.push(d)
      ecblocks.push(rsEnc(d, ec))
    }
  }
  const maxD = blocks.reduce((m, b) => Math.max(m, b.length), 0)
  const fin = []
  for (let i = 0; i < maxD; i++)
    for (const b of blocks) if (i < b.length) fin.push(b[i])
  for (let i = 0; i < ec; i++) for (const b of ecblocks) fin.push(b[i])

  /* --- module matrix --- */
  const n = v * 4 + 17
  const m = []
  const res = []
  for (let i = 0; i < n; i++) {
    m.push(new Array(n).fill(null))
    res.push(new Array(n).fill(false))
  }
  const setF = (r, c) => {
    res[r][c] = true
  }
  const finder = (r, c) => {
    for (let i = -1; i <= 7; i++)
      for (let j = -1; j <= 7; j++) {
        const rr = r + i
        const cc2 = c + j
        if (rr < 0 || rr >= n || cc2 < 0 || cc2 >= n) continue
        const on =
          (i >= 0 && i <= 6 && (j === 0 || j === 6)) ||
          (j >= 0 && j <= 6 && (i === 0 || i === 6)) ||
          (i >= 2 && i <= 4 && j >= 2 && j <= 4)
        m[rr][cc2] = on ? 1 : 0
        setF(rr, cc2)
      }
  }
  finder(0, 0)
  finder(0, n - 7)
  finder(n - 7, 0)

  for (let i = 8; i < n - 8; i++) {
    m[6][i] = i % 2 === 0 ? 1 : 0
    setF(6, i)
    m[i][6] = i % 2 === 0 ? 1 : 0
    setF(i, 6)
  }

  const ap = ALIGN[v]
  for (const r of ap)
    for (const c of ap) {
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= n - 9) || (r >= n - 9 && c <= 8)) continue
      for (let i = -2; i <= 2; i++)
        for (let j = -2; j <= 2; j++) {
          const on = Math.max(Math.abs(i), Math.abs(j)) !== 1
          m[r + i][c + j] = on ? 1 : 0
          setF(r + i, c + j)
        }
    }

  m[n - 8][8] = 1
  setF(n - 8, 8)
  for (let i = 0; i < 9; i++) {
    if (m[8][i] === null) {
      m[8][i] = 0
      setF(8, i)
    }
    if (m[i][8] === null) {
      m[i][8] = 0
      setF(i, 8)
    }
  }
  for (let i = 0; i < 8; i++) {
    if (m[8][n - 1 - i] === null) {
      m[8][n - 1 - i] = 0
      setF(8, n - 1 - i)
    }
    if (m[n - 1 - i][8] === null) {
      m[n - 1 - i][8] = 0
      setF(n - 1 - i, 8)
    }
  }

  // version info (v ≥ 7)
  if (v >= 7) {
    let vb = v << 12
    for (let i = 17; i >= 12; i--) if ((vb >> i) & 1) vb ^= 0x1f25 << (i - 12)
    vb |= v << 12
    for (let i = 0; i < 18; i++) {
      const vbit = (vb >> i) & 1
      const vr = Math.floor(i / 3)
      const vc = (i % 3) + n - 11
      m[vr][vc] = vbit
      setF(vr, vc)
      m[vc][vr] = vbit
      setF(vc, vr)
    }
  }

  /* --- zigzag data placement --- */
  const dataBits = []
  for (const b of fin) for (let j = 7; j >= 0; j--) dataBits.push((b >> j) & 1)
  let bi = 0
  let dir = -1
  let row = n - 1
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col--
    for (; row >= 0 && row < n; row += dir) {
      for (let c2 = 0; c2 < 2; c2++) {
        const cc3 = col - c2
        if (!res[row][cc3]) m[row][cc3] = bi < dataBits.length ? dataBits[bi++] : 0
      }
    }
    dir = -dir
    row += dir
  }

  /* --- pick the mask with the lowest penalty --- */
  const applyFmt = (grid, mk) => {
    const b = fmtBits(0, mk) // ECL M = 0
    for (let i = 0; i < 15; i++) {
      const bit = (b >> i) & 1
      if (i < 6) grid[i][8] = bit
      else if (i < 8) grid[i + 1][8] = bit
      else if (i === 8) grid[8][7] = bit
      else grid[8][14 - i] = bit
      if (i < 8) grid[8][n - 1 - i] = bit
      else grid[n - 15 + i][8] = bit
    }
  }
  const penalty = (grid) => {
    let p = 0
    for (let r = 0; r < n; r++) {
      let run = 1
      for (let c = 1; c < n; c++) {
        if (grid[r][c] === grid[r][c - 1]) {
          run++
          if (run === 5) p += 3
          else if (run > 5) p++
        } else run = 1
      }
    }
    for (let c = 0; c < n; c++) {
      let run = 1
      for (let r = 1; r < n; r++) {
        if (grid[r][c] === grid[r - 1][c]) {
          run++
          if (run === 5) p += 3
          else if (run > 5) p++
        } else run = 1
      }
    }
    for (let r = 0; r < n - 1; r++)
      for (let c = 0; c < n - 1; c++) {
        const x = grid[r][c]
        if (x === grid[r][c + 1] && x === grid[r + 1][c] && x === grid[r + 1][c + 1]) p += 3
      }
    let dark = 0
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (grid[r][c]) dark++
    p += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10
    return p
  }

  let best = null
  let bestP = Infinity
  for (let mk = 0; mk < 8; mk++) {
    const grid = m.map((rowArr) => rowArr.map((x) => x ?? 0))
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) if (!res[r][c] && maskF(mk, r, c)) grid[r][c] ^= 1
    applyFmt(grid, mk)
    const p = penalty(grid)
    if (p < bestP) {
      bestP = p
      best = grid
    }
  }
  return best
}

/** path เดียวจบทั้ง QR (เร็วกว่า <rect> ต่อโมดูล และ export เป็นรูปได้ตรง ๆ) */
function qrPath(matrix, quiet = 4) {
  let d = ''
  for (let y = 0; y < matrix.length; y++)
    for (let x = 0; x < matrix.length; x++)
      if (matrix[y][x]) d += 'M' + (x + quiet) + ' ' + (y + quiet) + 'h1v1h-1z'
  return d
}

w.IUQR = { matrix: qrMatrix, path: qrPath };
})(typeof window !== 'undefined' ? window : globalThis);
