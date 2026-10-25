import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Drawer,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import SaveIcon from "@mui/icons-material/Save";
import React, { useEffect, useState } from "react";
import {
  apiErrorMessage,
  readTextFile,
  validateName,
  writeTextFile,
} from "./app/api";
import { useNotify } from "./app/notifications";
import { fileName, type FileItem } from "./app/types";

export default function TextEditorDrawer({
  open,
  cwd,
  file,
  onClose,
  onSaved,
}: {
  open: boolean;
  cwd: string;
  file: FileItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const notify = useNotify();
  const [name, setName] = useState("note.txt");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDirty(false);
    if (file) {
      setName(fileName(file.key));
      setLoading(true);
      let cancelled = false;
      readTextFile(file.key)
        .then((text) => {
          if (!cancelled) setContent(text);
        })
        .catch((readError) => {
          if (!cancelled) setError(apiErrorMessage(readError));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }
    setName("note.txt");
    setContent("");
    setLoading(false);
    return undefined;
  }, [file, open]);

  const requestClose = () => {
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };

  const save = async () => {
    const nameError = validateName(name);
    if (!file && nameError) {
      setError(nameError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const key = file ? file.key : cwd + name.trim();
      await writeTextFile(key, content);
      setDirty(false);
      notify(`Saved ${fileName(key)}`, "success");
      onSaved();
      onClose();
    } catch (saveError) {
      setError(apiErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Drawer
        anchor="right"
        open={open}
        onClose={requestClose}
        PaperProps={{
          sx: {
            width: { xs: "100%", sm: 640 },
            maxWidth: "100%",
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 2,
            py: 1.5,
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          <Typography variant="h6" sx={{ flex: 1 }}>
            {file ? "Edit file" : "New text file"}
          </Typography>
          <IconButton onClick={requestClose} aria-label="Close editor">
            <CloseIcon />
          </IconButton>
        </Box>

        <Box sx={{ p: 2, flex: 1, display: "flex", flexDirection: "column", gap: 1.5, minHeight: 0 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              <TextField
                label="File name"
                size="small"
                value={name}
                disabled={Boolean(file)}
                onChange={(event) => {
                  setName(event.target.value);
                  setDirty(true);
                }}
                helperText={file ? "Rename from the file menu" : "Use .yaml, .ics, .json, .md, .txt, .conf, etc."}
              />
              <TextField
                multiline
                fullWidth
                value={content}
                onChange={(event) => {
                  setContent(event.target.value);
                  setDirty(true);
                }}
                placeholder="Write or paste file content…"
                inputProps={{ spellCheck: false }}
                sx={{
                  flex: 1,
                  minHeight: 260,
                  "& textarea": {
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
                    fontSize: 13,
                    lineHeight: 1.55,
                    height: "100% !important",
                    overflow: "auto !important",
                  },
                  "& .MuiInputBase-root": { alignItems: "stretch", height: "100%" },
                }}
              />
            </>
          )}
        </Box>

        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 1,
            px: 2,
            py: 1.5,
            borderTop: 1,
            borderColor: "divider",
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {dirty ? "Unsaved changes" : "UTF-8 text"}
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button onClick={requestClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={() => void save()}
              disabled={saving || loading}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </Stack>
        </Box>
      </Drawer>

      <Dialog open={confirmDiscard} onClose={() => setConfirmDiscard(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Discard changes?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            The file has unsaved changes. Closing now will discard them.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDiscard(false)}>Keep editing</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setConfirmDiscard(false);
              setDirty(false);
              onClose();
            }}
          >
            Discard
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
