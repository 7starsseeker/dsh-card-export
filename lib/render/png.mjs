#!/usr/bin/env node
/**
 * png — 零依赖的 PNG 读取/写入与按行裁切。
 *
 * 只支持本插件自己产出的格式：8-bit、非隔行、RGB(2) / RGBA(6)。
 * 任何不认识的输入都明确报错，不猜。
 *
 * 裁切位置来自**图上的分隔线**（渲染时画的那条通栏细线），所以裁出来必定落在内容单元边界。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { inflateSync, deflateSync } from 'node:zlib'

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : (pb <= pc ? b : c)
}

function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const t = Buffer.from(type, 'latin1')
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}

/** 读 PNG → { width, height, bpp, pixels }（pixels 为未过滤的原始行数据） */
export function readPng(file) {
  const buf = readFileSync(file)
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('不是 PNG 文件')
  let off = 8, ihdr = null
  const idat = []
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('latin1', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') ihdr = data
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    off += 12 + len
  }
  if (!ihdr) throw new Error('缺 IHDR')
  const width = ihdr.readUInt32BE(0)
  const height = ihdr.readUInt32BE(4)
  const bitDepth = ihdr[8], colorType = ihdr[9], interlace = ihdr[12]
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`不支持的 PNG 格式：bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace}`)
  }
  const bpp = colorType === 6 ? 4 : 3
  const rowBytes = width * bpp
  const raw = inflateSync(Buffer.concat(idat))
  const pixels = Buffer.alloc(rowBytes * height)
  let pos = 0
  for (let y = 0; y < height; y++) {
    const f = raw[pos++]
    const row = raw.subarray(pos, pos + rowBytes); pos += rowBytes
    const cur = pixels.subarray(y * rowBytes, (y + 1) * rowBytes)
    const prev = y > 0 ? pixels.subarray((y - 1) * rowBytes, y * rowBytes) : null
    for (let i = 0; i < rowBytes; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0
      const b = prev ? prev[i] : 0
      const c = (i >= bpp && prev) ? prev[i - bpp] : 0
      let v
      switch (f) {
        case 0: v = row[i]; break
        case 1: v = row[i] + a; break
        case 2: v = row[i] + b; break
        case 3: v = row[i] + ((a + b) >> 1); break
        case 4: v = row[i] + paeth(a, b, c); break
        default: throw new Error(`非法行过滤类型 ${f}`)
      }
      cur[i] = v & 0xff
    }
  }
  return { width, height, bpp, pixels }
}

/** 把一段行区间写成 PNG（每行用 filter 0，解码端无歧义） */
export function writePngRows(file, img, fromY, toY) {
  const { width, bpp, pixels } = img
  const rowBytes = width * bpp
  const rows = toY - fromY
  if (rows <= 0) throw new Error('裁切高度为 0')
  const raw = Buffer.alloc((rowBytes + 1) * rows)
  for (let y = 0; y < rows; y++) {
    raw[y * (rowBytes + 1)] = 0
    pixels.copy(raw, y * (rowBytes + 1) + 1, (fromY + y) * rowBytes, (fromY + y + 1) * rowBytes)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(rows, 4)
  ihdr[8] = 8
  ihdr[9] = bpp === 4 ? 6 : 2
  writeFileSync(file, Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]))
}

/**
 * 找出分隔线的行号（设备像素）。
 * 判据：整行（左右各让开一点，避免圆角/阴影）几乎全是同一个颜色，且该颜色是浅灰线色。
 * 返回每组连续行合并后的中心行。
 */
export function findSeparatorRows(img, opts = {}) {
  const target = opts.color || [226, 229, 233]   // #E2E5E9
  const tol = opts.tolerance ?? 6
  const inset = opts.inset ?? 60
  const { width, bpp, pixels } = img
  const rowBytes = width * bpp
  const x0 = inset * bpp, x1 = rowBytes - inset * bpp
  const step = bpp * 4
  const hit = []
  for (let y = 0; y < img.height; y++) {
    const row = pixels.subarray(y * rowBytes, (y + 1) * rowBytes)
    let ok = true
    for (let i = x0; i < x1; i += step) {
      if (Math.abs(row[i] - target[0]) > tol || Math.abs(row[i + 1] - target[1]) > tol || Math.abs(row[i + 2] - target[2]) > tol) { ok = false; break }
    }
    if (ok) hit.push(y)
  }
  // 合并连续行
  const groups = []
  for (const y of hit) {
    const last = groups[groups.length - 1]
    if (last && y - last[last.length - 1] <= 1) last.push(y)
    else groups.push([y])
  }
  return groups.map((g) => ({ y: Math.round((g[0] + g[g.length - 1]) / 2), rows: g.length }))
}

/**
 * 按给定的裁切点把图切成多张；**分隔线本身整行丢弃**，避免接缝处留一条灰边。
 * @param {string} file 源图
 * @param {number[]} cuts 裁切点行号（设备像素，升序，通常是分隔线中心）
 * @param {(i:number)=>string} nameFor 第 i 段（从 1 开始）的输出路径
 * @param {{lineRows?:number}} opts lineRows：每个切点要丢弃的行数（分隔线厚度，默认 2）
 */
export function cutAt(file, cuts, nameFor, opts = {}) {
  const img = readPng(file)
  const lineRows = opts.lineRows ?? 2
  const half = Math.floor(lineRows / 2)
  const ranges = []
  let start = 0
  for (const y of cuts) {
    if (y <= 0 || y >= img.height) continue
    const end = Math.max(start, y - half)          // 段末（不含）
    if (end > start) ranges.push([start, end])
    start = Math.min(img.height, y - half + lineRows)  // 跳过整条线
  }
  if (start < img.height) ranges.push([start, img.height])

  const out = []
  ranges.forEach(([from, to], i) => {
    const path = nameFor(i + 1)
    writePngRows(path, img, from, to)
    out.push({ part: i + 1, path, fromY: from, toY: to, height: to - from })
  })
  return out
}
