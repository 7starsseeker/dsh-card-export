#!/usr/bin/env node
/**
 * blank-height — 只读地量出 PNG 底部有多少行是纯色空白。
 *
 * 用途不是裁剪图片，而是**修正下一次渲染的高度**：浏览器自报的高度与实际绘制位置
 * 之间有偏差（实测可达 200+ px），第一次按自报高度出图后，用这个函数量出偏差，
 * 再按正确高度重新渲染一次——最终产物仍是浏览器直出的完整画面，不做任何像素裁剪。
 *
 * 只用 node:zlib。仅支持 8-bit、非隔行 RGB/RGBA。任何异常都返回 null（调用方按原样处理）。
 */
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : (pb <= pc ? b : c)
}

/**
 * @param {string} file PNG 路径
 * @returns {{height:number, blank:number}|null} blank 为底部纯色行数（设备像素）
 */
export function blankBottom(file) {
  try {
    const buf = readFileSync(file)
    if (!buf.subarray(0, 8).equals(SIG)) return null
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
    if (!ihdr) return null
    const width = ihdr.readUInt32BE(0)
    const height = ihdr.readUInt32BE(4)
    const bitDepth = ihdr[8], colorType = ihdr[9], interlace = ihdr[12]
    if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) return null
    const bpp = colorType === 6 ? 4 : 3
    const rowBytes = width * bpp
    const raw = inflateSync(Buffer.concat(idat))
    // 只需从底部往上解：先解全部行（实现简单，内存可接受）
    const px = Buffer.alloc(rowBytes * height)
    let pos = 0
    for (let y = 0; y < height; y++) {
      const f = raw[pos++]
      const row = raw.subarray(pos, pos + rowBytes); pos += rowBytes
      const cur = px.subarray(y * rowBytes, (y + 1) * rowBytes)
      const prev = y > 0 ? px.subarray((y - 1) * rowBytes, y * rowBytes) : null
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
          default: return null
        }
        cur[i] = v & 0xff
      }
    }
    // 背景色取样：左上角（卡片居中，四角一定是页面背景）
    const bg = [px[2 * bpp], px[2 * bpp + 1], px[2 * bpp + 2]]
    const tol = 8
    let blank = 0
    for (let y = height - 1; y >= 0; y--) {
      const row = px.subarray(y * rowBytes, (y + 1) * rowBytes)
      let allBg = true
      for (let i = 0; i < rowBytes; i += bpp) {
        if (Math.abs(row[i] - bg[0]) > tol || Math.abs(row[i + 1] - bg[1]) > tol || Math.abs(row[i + 2] - bg[2]) > tol) {
          allBg = false; break
        }
      }
      if (!allBg) break
      blank++
    }
    return { height, blank }
  } catch {
    return null
  }
}
