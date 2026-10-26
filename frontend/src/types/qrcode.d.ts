// Minimal typing for the `qrcode` package so the project type-checks without @types/qrcode.
declare module 'qrcode' {
  const QRCode: { toDataURL(text: string, opts?: { width?: number; margin?: number; errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' }): Promise<string> };
  export default QRCode;
}
