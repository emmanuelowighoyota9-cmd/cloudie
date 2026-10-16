import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Image, Palette, Type, Shapes, Download, ArrowLeft, RotateCcw } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";

const templates = [
  { id: "social", name: "Social Media Post", width: 1080, height: 1080 },
  { id: "banner", name: "Web Banner", width: 1200, height: 630 },
  { id: "story", name: "Story", width: 1080, height: 1920 },
  { id: "thumbnail", name: "Thumbnail", width: 1280, height: 720 },
] as const;

type TemplateId = typeof templates[number]["id"];

export default function RenderStudio() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>("social");
  const [title, setTitle] = useState("Make something great.");
  const [subtitle, setSubtitle] = useState("Your next idea starts here.");
  const [background, setBackground] = useState("#101827");
  const [accent, setAccent] = useState("#60a5fa");
  const [shape, setShape] = useState<"circle" | "square" | "none">("circle");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const selected = templates.find((item) => item.id === selectedTemplate) ?? templates[0];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = selected;
    canvas.width = width;
    canvas.height = height;

    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    const glow = ctx.createRadialGradient(width * 0.82, height * 0.2, 5, width * 0.82, height * 0.2, Math.max(width, height) * 0.8);
    glow.addColorStop(0, accent + "55");
    glow.addColorStop(1, background + "00");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    if (shape !== "none") {
      ctx.fillStyle = accent;
      if (shape === "circle") {
        ctx.beginPath();
        ctx.arc(width * 0.78, height * 0.72, Math.min(width, height) * 0.12, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(width * 0.69, height * 0.64, Math.min(width, height) * 0.19, Math.min(width, height) * 0.19);
      }
    }

    const margin = width * 0.09;
    const maxTextWidth = width * 0.78;
    ctx.textBaseline = "top";
    ctx.fillStyle = "#ffffff";
    const fontSize = Math.max(28, Math.min(width, height) * (selectedTemplate === "story" ? 0.075 : 0.09));
    ctx.font = `700 ${fontSize}px system-ui, -apple-system, sans-serif`;
    const words = title.trim().split(/\s+/);
    let line = "";
    let lineY = height * 0.35;
    const lineHeight = fontSize * 1.15;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxTextWidth && line) {
        ctx.fillText(line, margin, lineY, maxTextWidth);
        lineY += lineHeight;
        line = word;
      } else line = test;
    }
    if (line) ctx.fillText(line, margin, lineY, maxTextWidth);

    ctx.fillStyle = accent;
    ctx.fillRect(margin, lineY + fontSize * 1.35, width * 0.13, Math.max(5, width * 0.008));
    ctx.fillStyle = "#e5e7eb";
    ctx.font = `400 ${Math.max(18, fontSize * 0.31)}px system-ui, -apple-system, sans-serif`;
    const subtitleY = lineY + fontSize * 1.8;
    const subWords = subtitle.trim().split(/\s+/);
    let subLine = "";
    let subY = subtitleY;
    for (const word of subWords) {
      const test = subLine ? `${subLine} ${word}` : word;
      if (ctx.measureText(test).width > maxTextWidth && subLine) {
        ctx.fillText(subLine, margin, subY, maxTextWidth);
        subY += fontSize * 0.48;
        subLine = word;
      } else subLine = test;
    }
    if (subLine) ctx.fillText(subLine, margin, subY, maxTextWidth);

    if (imageUrl) {
      const img = new window.Image();
      img.onload = () => {
        const maxWidth = width * 0.22;
        const maxHeight = height * 0.22;
        const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
        const iw = img.width * ratio;
        const ih = img.height * ratio;
        ctx.save();
        ctx.beginPath();
        ctx.arc(width * 0.78, height * 0.28, Math.min(iw, ih) * 0.55, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, width * 0.78 - iw / 2, height * 0.28 - ih / 2, iw, ih);
        ctx.restore();
      };
      img.src = imageUrl;
    }
  }, [selected, selectedTemplate, title, subtitle, background, accent, shape, imageUrl]);

  const exportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) {
        toast.error("Could not export this design. Please try again.");
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `cloudie-design-${selectedTemplate}.png`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("PNG exported successfully.");
    }, "image/png");
  };

  const handleImage = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Choose an image under 8 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImageUrl(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const reset = () => {
    setTitle("Make something great.");
    setSubtitle("Your next idea starts here.");
    setBackground("#101827");
    setAccent("#60a5fa");
    setShape("circle");
    setImageUrl(null);
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex items-center gap-4">
        <Link to="/services"><Button variant="ghost" size="icon" aria-label="Back to services"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Rendering Studio</h1>
          <p className="mt-1 text-sm text-muted-foreground">Design social posts, banners, stories and thumbnails, then export a high-resolution PNG.</p>
        </div>
        <Button variant="outline" size="sm" onClick={reset} className="shrink-0 gap-2"><RotateCcw className="h-4 w-4" /><span className="hidden sm:inline">Reset</span></Button>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)]">
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border">
            <div><CardTitle className="text-base">Live canvas</CardTitle><p className="mt-1 text-xs text-muted-foreground">{selected.width} × {selected.height} px</p></div>
            <Button onClick={exportPng} className="gap-2"><Download className="h-4 w-4" /> Export PNG</Button>
          </CardHeader>
          <CardContent className="p-3 sm:p-6">
            <div className="flex min-h-72 items-center justify-center overflow-hidden rounded-xl bg-muted/60 p-3 sm:p-6">
              <canvas ref={canvasRef} aria-label="Live design preview" className="h-auto max-h-[70vh] w-full rounded-md object-contain shadow-xl" style={{ aspectRatio: `${selected.width}/${selected.height}` }} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Export runs in your browser. No external design service is required.</p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Canvas size</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {templates.map((template) => (
                <button key={template.id} type="button" onClick={() => setSelectedTemplate(template.id)} className={`rounded-xl border p-3 text-left transition-colors ${selectedTemplate === template.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}>
                  <span className="block text-sm font-semibold text-foreground">{template.name}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{template.width} × {template.height}</span>
                </button>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Type className="h-4 w-4" /> Content</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5"><Label htmlFor="render-title">Headline</Label><Input id="render-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="render-subtitle">Supporting text</Label><Input id="render-subtitle" value={subtitle} maxLength={180} onChange={(e) => setSubtitle(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="render-image">Add image</Label><Input id="render-image" type="file" accept="image/*" onChange={(e) => handleImage(e.target.files?.[0])} /><p className="text-xs text-muted-foreground">Optional image, up to 8 MB.</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Palette className="h-4 w-4" /> Style</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label htmlFor="render-bg">Background</Label><Input id="render-bg" type="color" value={background} onChange={(e) => setBackground(e.target.value)} className="h-10 p-1" /></div>
              <div className="space-y-1.5"><Label htmlFor="render-accent">Accent</Label><Input id="render-accent" type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-10 p-1" /></div>
              <div className="col-span-2 space-y-1.5"><Label htmlFor="render-shape">Accent shape</Label><select id="render-shape" value={shape} onChange={(e) => setShape(e.target.value as typeof shape)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="circle">Circle</option><option value="square">Square</option><option value="none">No shape</option></select></div>
              <div className="col-span-2 flex items-center gap-2 text-xs text-muted-foreground"><Shapes className="h-4 w-4" /><Image className="h-4 w-4" /> Changes update the canvas immediately.</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
