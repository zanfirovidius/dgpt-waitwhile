'use client';

import { QR_THEME } from '@/lib/ui-tokens';
import { Download, Printer, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useRef } from 'react';

interface QRCodeModuleProps {
  url: string;
  title: string;
  subtitle?: string;
  active: boolean;
}

export default function QRCodeModule({ url, title, subtitle, active }: QRCodeModuleProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const escapeHtml = (value: string) =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Tipărire cod QR - ${escapeHtml(title)}</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; 
              display: flex; 
              flex-direction: column; 
              align-items: center; 
              justify-content: center; 
              height: 100vh; 
              margin: 0; 
              background: ${QR_THEME.pageBackground};
            }
            .container { 
              text-align: center; 
              border: 1px solid ${QR_THEME.border}; 
              padding: 60px; 
              border-radius: 40px; 
              width: 80%; 
              max-width: 600px;
              background: ${QR_THEME.surface};
              box-shadow: ${QR_THEME.shadow};
            }
            h1 { 
              margin-bottom: 8px; 
              font-size: 32px; 
              font-weight: 800;
              color: ${QR_THEME.title}; 
              letter-spacing: -0.02em;
            }
            p { 
              margin-bottom: 40px; 
              font-size: 18px; 
              color: ${QR_THEME.text}; 
              line-height: 1.5;
            }
            #qr-target {
              display: flex;
              justify-content: center;
              margin-bottom: 40px;
            }
            #qr-target svg {
                width: 300px !important;
                height: 300px !important;
            }
            .url { 
              margin-top: 20px; 
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
              font-size: 14px; 
              color: ${QR_THEME.muted}; 
              word-break: break-all;
              max-width: 400px;
              margin-left: auto;
              margin-right: auto;
            }
            @media print {
              body { height: auto; padding: 20px; }
              .container { border: none; box-shadow: none; width: 100%; max-width: none; border-radius: 0; padding: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>${escapeHtml(title)}</h1>
            ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
            <div id="qr-target"></div>
            <div class="url">${escapeHtml(url)}</div>
          </div>
          <script>
            document.getElementById('qr-target').innerHTML = \`${printContent.innerHTML}\`;
            // Ensure SVG scales for print
            const svg = document.querySelector('svg');
            if (svg) {
                svg.setAttribute('width', '350');
                svg.setAttribute('height', '350');
            }
            window.onload = () => {
                setTimeout(() => {
                    window.print();
                }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDownload = () => {
    const svg = printRef.current?.querySelector('#qr-code-svg');
    if (!svg) return;
    
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      // High res download
      const padding = 60;
      canvas.width = 1200;
      canvas.height = 1200;
      
      if (ctx) {
        ctx.fillStyle = QR_THEME.canvasBackground;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw some "border/branding" on the PNG? Simple white box is enough.
        ctx.drawImage(img, padding, padding, canvas.width - (padding * 2), canvas.height - (padding * 2));
        
        const pngFile = canvas.toDataURL('image/png', 1.0);
        const downloadLink = document.createElement('a');
        downloadLink.download = `qr-code-${title.toLowerCase().replace(/\s+/g, '-')}.png`;
        downloadLink.href = `${pngFile}`;
        downloadLink.click();
      }
    };
    
    // Add charset for safe b64 encoding of special characters
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url_blob = URL.createObjectURL(blob);
    img.src = url_blob;
  };

  if (!active) {
    return (
      <div className="bg-base-200/50 rounded-3xl p-8 border border-dashed border-base-300 flex flex-col items-center justify-center text-center opacity-60 h-full min-h-[300px]">
        <QrCode size={48} className="mb-4 opacity-20" />
        <h3 className="font-bold text-base">Cod QR Indisponibil</h3>
        <p className="text-sm max-w-[200px] mt-1">Activează acest modul pentru a genera codul QR de acces public.</p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-base-200 bg-base-100 p-6 shadow-sm flex flex-col">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
          <QrCode size={24} />
        </div>
        <div>
          <h3 className="font-bold text-lg text-base-content tracking-tight">Cod QR Public</h3>
          <p className="text-sm text-base-content/50">Acces instant pentru participanți</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center py-2">
        <div
          className="mb-6 rounded-3xl border border-base-200 p-6 shadow-sm"
          style={{ backgroundColor: QR_THEME.canvasBackground, boxShadow: QR_THEME.shadow }}
          ref={printRef}
        >
          <QRCodeSVG 
            id="qr-code-svg"
            value={url} 
            size={240}
            level="H"
            includeMargin={false}
            imageSettings={{
                src: "/logo.png",
                x: undefined,
                y: undefined,
                height: 40,
                width: 40,
                excavate: true,
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 w-full">
          <button 
            onClick={handlePrint}
            className="btn btn-primary rounded-2xl gap-2 shadow-sm"
          >
            <Printer size={18} /> Tipărește
          </button>
          <button 
            onClick={handleDownload}
            className="btn btn-outline border-base-300 rounded-2xl gap-2 hover:bg-base-200 hover:text-base-content hover:border-base-300"
          >
            <Download size={18} /> Salvează PNG
          </button>
        </div>
        
        <div className="mt-6 pt-4 border-t border-base-200 w-full">
          <div className="text-[10px] uppercase font-bold tracking-widest opacity-30 mb-2 text-center">URL Sursă Cod</div>
          <div className="bg-base-200/50 px-4 py-3 rounded-2xl text-[11px] font-mono break-all text-center opacity-60 border border-base-200 overflow-hidden text-ellipsis whitespace-nowrap">
            {url}
          </div>
        </div>
      </div>
    </div>
  );
}
