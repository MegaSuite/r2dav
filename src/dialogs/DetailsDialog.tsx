import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Button,
  Stack,
  Typography,
} from "@mui/material";
import React from "react";
import { friendlyType, resolveMime } from "../app/mime";
import { fileName, isDirectory, type FileItem } from "../app/types";
import { formatDate, humanReadableSize } from "../app/utils";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={0.5}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 110 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ wordBreak: "break-all" }}>
        {value}
      </Typography>
    </Stack>
  );
}

export default function DetailsDialog({
  file,
  onClose,
}: {
  file: FileItem | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(file)} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>File details</DialogTitle>
      <DialogContent>
        {file && (
          <Stack spacing={1.25} sx={{ mt: 0.5 }}>
            <Row label="Name" value={fileName(file.key)} />
            <Row label="Path" value={file.key} />
            <Row label="Type" value={`${friendlyType(file)} (${resolveMime(file.key, file.httpMetadata?.contentType)})`} />
            <Row label="Size" value={isDirectory(file) ? "—" : humanReadableSize(file.size)} />
            <Row label="Modified" value={formatDate(file.uploaded)} />
            <Row label="ETag" value="—" />
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
