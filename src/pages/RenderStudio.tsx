import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Image, Palette, Type, Shapes, Download } from "lucide-react";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";

export default function RenderStudio() {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const templates = [
    { id: "social", name: "Social Media Post", size: "1080×1080" },
    { id: "banner", name: "Web Banner", size: "1200×630" },
    { id: "story", name: "Story", size: "1080×1920" },
    { id: "thumbnail", name: "Thumbnail", size: "1280×720" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link to="/services"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Rendering Studio</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create and render images. Cost: 50 points per render.</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Canvas */}
        <Card className="notebook-card lg:col-span-2">
          <CardContent className="p-6">
            <div className="aspect-video rounded-xl border-2 border-dashed border-[var(--nb-rule)] bg-[var(--nb-surface)] flex items-center justify-center">
              <div className="text-center">
                <Image className="mx-auto h-12 w-12 text-muted-foreground/30" />
                <p className="mt-3 text-sm text-muted-foreground">Select a template or start from scratch</p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Button variant="outline" size="sm"><Type className="h-4 w-4 mr-1" /> Text</Button>
              <Button variant="outline" size="sm"><Shapes className="h-4 w-4 mr-1" /> Shapes</Button>
              <Button variant="outline" size="sm"><Image className="h-4 w-4 mr-1" /> Image</Button>
              <Button variant="outline" size="sm"><Palette className="h-4 w-4 mr-1" /> Colors</Button>
              <Button size="sm" className="ml-auto"><Download className="h-4 w-4 mr-1" /> Export (50 pts)</Button>
            </div>
          </CardContent>
        </Card>

        {/* Templates */}
        <Card className="notebook-card">
          <CardHeader><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Templates</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {templates.map((t) => (
              <button key={t.id} onClick={() => setSelectedTemplate(t.id)} className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedTemplate === t.id ? "border-blue-500 bg-blue-50 dark:bg-blue-950/50" : "border-[var(--nb-rule)] hover:bg-[var(--nb-ink)]/5"}`}>
                <p className="text-sm font-medium text-[var(--nb-ink)]">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.size}</p>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
