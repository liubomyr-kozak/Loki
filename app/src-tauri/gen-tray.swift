// Renders the real U+1F703 (🜃 Alchemical Symbol for Earth) glyph from the
// system "Apple Symbols" font into icons/tray.png — a black-on-transparent
// template image for the macOS menu-bar tray.
//
// Run: swift gen-tray.swift
import AppKit

let size = 44                      // tray template size (pt)
let scale = 2                      // render @2x for retina crispness
let px = size * scale
let glyph = "\u{1F703}"            // 🜃

let img = NSImage(size: NSSize(width: px, height: px))
img.lockFocus()

let ctx = NSGraphicsContext.current!.cgContext
ctx.clear(CGRect(x: 0, y: 0, width: px, height: px))

// Font sized to fill most of the canvas with a little padding.
let font = NSFont(name: "Apple Symbols", size: CGFloat(px) * 0.82)
    ?? NSFont.systemFont(ofSize: CGFloat(px) * 0.82)

let attrs: [NSAttributedString.Key: Any] = [
    .font: font,
    .foregroundColor: NSColor.black,   // template: alpha is what matters
]
let str = NSAttributedString(string: glyph, attributes: attrs)
let bounds = str.size()

// Center the glyph in the canvas.
let origin = NSPoint(
    x: (CGFloat(px) - bounds.width) / 2,
    y: (CGFloat(px) - bounds.height) / 2
)
str.draw(at: origin)

img.unlockFocus()

guard let tiff = img.tiffRepresentation,
      let rep = NSBitmapImageRep(data: tiff),
      let png = rep.representation(using: .png, properties: [:]) else {
    FileHandle.standardError.write("failed to encode PNG\n".data(using: .utf8)!)
    exit(1)
}

let outPath = "icons/tray.png"
do {
    try png.write(to: URL(fileURLWithPath: outPath))
    print("wrote \(outPath) (\(px)x\(px))")
} catch {
    FileHandle.standardError.write("write failed: \(error)\n".data(using: .utf8)!)
    exit(1)
}
