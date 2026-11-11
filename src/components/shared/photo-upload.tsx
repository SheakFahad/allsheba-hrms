"use client";

import * as React from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { publicStorageUrl } from "@/lib/format";
import { EmployeeAvatar } from "./employee-avatar";

const ALLOWED = ["image/png", "image/jpeg", "image/webp"];

/** Uploads straight to the public-assets bucket (admin-only write via storage RLS). */
export function PhotoUpload({
  value,
  onChange,
  folder,
  name,
  maxMb = 2,
  shape = "avatar",
}: {
  value: string | null;
  onChange: (path: string | null) => void;
  folder: string;
  name: string;
  maxMb?: number;
  shape?: "avatar" | "logo";
}) {
  const [busy, setBusy] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  const url = publicStorageUrl(value);

  async function upload(file: File) {
    if (!ALLOWED.includes(file.type)) return toast.error("Please choose a PNG, JPG or WEBP image.");
    if (file.size > maxMb * 1024 * 1024) return toast.error(`Image must be smaller than ${maxMb} MB.`);
    setBusy(true);
    try {
      const ext = file.type.split("/")[1].replace("jpeg", "jpg");
      const path = `${folder}/${crypto.randomUUID()}.${ext}`;
      const { error } = await createClient().storage.from("public-assets").upload(path, file, {
        contentType: file.type,
        upsert: false,
        cacheControl: "31536000",
      });
      if (error) throw error;
      onChange(path);
    } catch (e) {
      toast.error(`Upload failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      {shape === "avatar" ? (
        <EmployeeAvatar name={name || "?"} photoUrl={url} className="size-16 text-base" />
      ) : (
        <div className="grid h-16 w-40 place-items-center rounded-lg border bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- preview of uploaded logo */}
          {url ? <img src={url} alt="Logo preview" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted-foreground">Default logo</span>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <input
          ref={input}
          type="file"
          accept={ALLOWED.join(",")}
          className="sr-only"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Camera />}
          {value ? "Change" : "Upload"}
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)} disabled={busy}>
            <Trash2 /> Remove
          </Button>
        )}
        <p className="w-full text-xs text-muted-foreground">PNG, JPG or WEBP, up to {maxMb} MB.</p>
      </div>
    </div>
  );
}
