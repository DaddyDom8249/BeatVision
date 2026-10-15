import { useEffect, useState } from "react";
import type { CharacterAsset, EnvironmentAsset } from "../../types/style";

type Asset = CharacterAsset | EnvironmentAsset;

function AssetCard<T extends Asset>({
  asset,
  onApprove,
  onRefresh,
  working,
}: {
  asset: T;
  onApprove: (asset: T) => void;
  onRefresh?: () => Promise<unknown>;
  working: boolean;
}) {
  const [previewFailed, setPreviewFailed] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const mediaType = typeof asset.metadata?.mime_type === "string" ? asset.metadata.mime_type : "";
  const isHeif = /^image\/hei[cf]$/i.test(mediaType) || /\.(heif|heic)$/i.test(asset.label);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    setPreviewFailed(false);
    setRefreshError(null);
  }, [asset.signed_url]);

  function refresh() {
    if (!onRefresh) return;
    setRefreshError(null);
    void onRefresh().catch((reason: unknown) => {
      setRefreshError(reason instanceof Error ? reason.message : "Unable to refresh secure image preview.");
    });
  }

  return (
    <article className="style-asset-card">
      {asset.signed_url && !previewFailed ? (
        <div style={{ position: "relative" }}>
          <img
            src={asset.signed_url}
            alt={`Reference preview: ${asset.label}`}
            loading="lazy"
            onError={() => setPreviewFailed(true)}
            style={{ width: "100%", height: "160px", objectFit: "contain", borderRadius: "6px", display: "block", background: "var(--bg-surface-0)" }}
          />
          <button
            type="button"
            className="secondary-button"
            style={{ fontSize: "11px", padding: "4px 8px", position: "absolute", bottom: "6px", right: "6px", background: "rgba(13, 13, 18, 0.85)" }}
            onClick={() => setInspecting(true)}
          >
            Inspect Full Image
          </button>
        </div>
      ) : (
        isHeif ? (
          <p role="status">HEIF/HEIC reference saved, but this browser could not display its preview. Refreshing the secure link will not convert the file. For a visible reference, upload a JPEG or PNG separately; the original record stays unchanged.</p>
        ) : (
          <p role="status">Reference preview unavailable or its secure link expired. The uploaded record is still saved.</p>
        )
      )}

      {(previewFailed || !asset.signed_url) && onRefresh && !isHeif && (
        <button type="button" className="secondary-button" style={{ fontSize: "12px", marginTop: "8px" }} disabled={working} onClick={refresh}>
          Refresh image preview
        </button>
      )}
      {refreshError && <p role="alert" className="form-error">{refreshError}</p>}

      <div style={{ marginTop: "8px" }}>
        <strong style={{ fontSize: "13px", color: "#ffffff", display: "block" }}>{asset.label}</strong>
        <span style={{ fontSize: "11px", color: "var(--accent-gold)", fontFamily: "var(--font-mono)" }}>
          Status: {asset.status}
        </span>
      </div>

      <details className="style-asset-storage"><summary>Storage details</summary><code>{asset.storage_path}</code></details>

      {asset.status !== "approved" && (
        <button
          type="button"
          className="secondary-button"
          style={{ width: "100%", marginTop: "10px", fontSize: "12px" }}
          disabled={working}
          onClick={() => onApprove(asset)}
        >
          Approve Asset
        </button>
      )}

      {inspecting && asset.signed_url && (
        <dialog
          open
          className="asset-inspect-dialog"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            width: "100vw",
            height: "100vh",
            maxWidth: "100vw",
            maxHeight: "100vh",
            background: "rgba(0,0,0,0.85)",
            border: "none",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            boxSizing: "border-box"
          }}
          onClick={() => setInspecting(false)}
        >
          <div
            style={{ maxWidth: "90vw", maxHeight: "85vh", display: "flex", flexDirection: "column", gap: "12px", alignItems: "center" }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={asset.signed_url}
              alt={`Full reference: ${asset.label}`}
              style={{ maxWidth: "100%", maxHeight: "75vh", objectFit: "contain", borderRadius: "8px", border: "1px solid var(--border-medium)" }}
            />
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <span style={{ color: "#ffffff", fontWeight: 600 }}>{asset.label}</span>
              <button type="button" className="secondary-button" onClick={() => setInspecting(false)}>Close Full View</button>
            </div>
          </div>
        </dialog>
      )}
    </article>
  );
}

export default function AssetList<T extends Asset>({
  assets,
  onApprove,
  onRefresh,
  working,
}: {
  assets: T[];
  onApprove: (asset: T) => void;
  onRefresh?: () => Promise<unknown>;
  working: boolean;
}) {
  if (assets.length === 0) {
    return <p style={{ fontSize: "12px", color: "var(--text-dim)" }}>No reference assets uploaded yet.</p>;
  }

  return (
    <div className="style-asset-list">
      {assets.map((asset) => (
        <AssetCard
          key={asset.id}
          asset={asset}
          onApprove={onApprove}
          onRefresh={onRefresh}
          working={working}
        />
      ))}
    </div>
  );
}
