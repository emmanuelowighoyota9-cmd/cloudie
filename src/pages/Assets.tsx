import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Empty, EmptyMedia, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { FolderOpen, Upload, File, Image, Trash2 } from "lucide-react";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";

export default function Assets() {
  const assets = useQuery(api.assets.listAssets, {});
  const usage = useQuery(api.assets.getStorageUsage);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link to="/services"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Asset Manager</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {usage !== undefined ? `Storage used: ${(usage / 1024 / 1024).toFixed(2)} MB` : "Manage your digital assets"}
          </p>
        </div>
        <Button className="gap-2"><Upload className="h-4 w-4" /> Upload</Button>
      </div>

      {assets === undefined ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="notebook-card"><CardContent className="p-4 animate-pulse"><div className="h-24 bg-muted rounded" /></CardContent></Card>
          ))}
        </div>
      ) : assets.length === 0 ? (
        <Empty>
          <EmptyMedia variant="icon"><FolderOpen /></EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No assets yet</EmptyTitle>
            <EmptyDescription>Upload files to start managing your digital assets.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {assets.map((asset) => (
            <Card key={asset._id} className="notebook-card group">
              <CardContent className="p-4">
                <div className="flex h-20 items-center justify-center rounded-lg bg-muted/50">
                  {asset.type.startsWith("image") ? (
                    <Image className="h-8 w-8 text-muted-foreground" />
                  ) : (
                    <File className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <p className="mt-2 text-sm font-medium text-[var(--nb-ink)] truncate">{asset.name}</p>
                <p className="text-xs text-muted-foreground">{(asset.size / 1024).toFixed(1)} KB • {new Date(asset.createdAt).toLocaleDateString()}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
