// Soft cut-out masks with Apple Vision (the same model as "lift subject" in Photos).
// Run: swift scripts/subject_mask.swift <in.jpg> <out.png> [<in.jpg> <out.png> ...]
// Writes a greyscale PNG the size of the photo: white = subject, black = background.
// Photos with no clear subject (landscapes) get no file, so the caller keeps one layer.
import AppKit
import CoreImage
import Vision

let args = Array(CommandLine.arguments.dropFirst())
let ctx = CIContext()
for i in stride(from: 0, to: args.count - 1, by: 2) {
    let input = URL(fileURLWithPath: args[i]), output = URL(fileURLWithPath: args[i + 1])
    guard let image = CIImage(contentsOf: input) else { print("skip (unreadable)", args[i]); continue }
    let request = VNGenerateForegroundInstanceMaskRequest()
    let handler = VNImageRequestHandler(ciImage: image)
    do {
        try handler.perform([request])
        guard let result = request.results?.first, !result.allInstances.isEmpty else { print("no subject", args[i]); continue }
        let buffer = try result.generateScaledMaskForImage(forInstances: result.allInstances, from: handler)
        let mask = CIImage(cvPixelBuffer: buffer)
        try ctx.writePNGRepresentation(of: mask, to: output, format: .L8, colorSpace: CGColorSpaceCreateDeviceGray())
        print("mask", args[i])
    } catch {
        print("failed", args[i], error)
    }
}
