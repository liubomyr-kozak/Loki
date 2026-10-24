import AppKit

let px = 1024
let glyph = "\u{1F703}"            // 🜃

let img = NSImage(size: NSSize(width: px, height: px))
img.lockFocus()

let ctx = NSGraphicsContext.current!.cgContext
ctx.clear(CGRect(x: 0, y: 0, width: px, height: px))   // transparent

let font = NSFont(name: "Apple Symbols", size: CGFloat(px) * 0.72)
    ?? NSFont.systemFont(ofSize: CGFloat(px) * 0.72)

let attrs: [NSAttributedString.Key: Any] = [
    .font: font,
    .foregroundColor: NSColor(srgbRed: 16/255, green: 185/255, blue: 129/255, alpha: 1), // emerald #10b981
]
let str = NSAttributedString(string: glyph, attributes: attrs)
let bounds = str.size()

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

let outPath = "app-icon.png"
do {
    try png.write(to: URL(fileURLWithPath: outPath))
    print("wrote \(outPath) (\(px)x\(px))")
} catch {
    FileHandle.standardError.write("write failed: \(error)\n".data(using: .utf8)!)
    exit(1)
}
