import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { QRCodeSVG } from "qrcode.react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiErrorMessage, createShareLink } from "../app/api";
import { copyText } from "../app/clipboard";
import { useNotify } from "../app/notifications";
import { fileName, type FileItem, type ShareLink } from "../app/types";
import { formatDate } from "../app/utils";

const EXPIRY_OPTIONS = [
  { value: "0", label: "Permanent" },
  { value: "3600", label: "1 hour" },
  { value: "86400", label: "1 day" },
  { value: "604800", label: "7 days" },
  { value: "2592000", label: "30 days" },
  { value: "custom", label: "Custom…" },
];


export default function ShareDialog({
  open,
  file,
  onClose,
}: {
  open: boolean;
  file: FileItem | null;
  onClose: () => void;
}) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const notify = useNotify();
  const [expiry, setExpiry] = useState("0");
  const [customDays, setCustomDays] = useState("30");
  const [link, setLink] = useState<ShareLink | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expiresIn = useMemo<number | null>(() => {
    if (expiry !== "custom") return Number(expiry);
    const days = Number(customDays);
    if (!Number.isFinite(days) || days <= 0 || days > 365) return null;
    return Math.round(days * 86400);
  }, [customDays, expiry]);

  const generate = useCallback(async () => {
    if (!file || expiresIn === null) return;
    setLoading(true);
    setError(null);
    try {
      setLink(await createShareLink(file.key, expiresIn));
    } catch (generateError) {
      setLink(null);
      setError(apiErrorMessage(generateError));
    } finally {
      setLoading(false);
    }
  }, [expiresIn, file]);

  useEffect(() => {
    if (!open) return;
    setLink(null);
    setError(null);
    if (expiresIn === null) {
      setError("Enter a number of days between 1 and 365.");
      return;
    }
    void generate();
  }, [expiresIn, generate, open]);

  const copy = async () => {
    if (!link) return;
    try {
      await copyText(link.url);
      notify("Link copied", "success");
    } catch {
      notify("Could not copy the link", "error");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      fullScreen={fullScreen}
    >
      <DialogTitle>Share {file ? fileName(file.key) : "file"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <FormControl fullWidth size="small">
            <InputLabel id="share-expiry">Link expires</InputLabel>
            <Select
              labelId="share-expiry"
              label="Link expires"
              value={expiry}
              onChange={(event) => setExpiry(event.target.value)}
            >
              {EXPIRY_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {expiry === "custom" && (
            <TextField
              size="small"
              label="Days until expiry"
              type="number"
              value={customDays}
              onChange={(event) => setCustomDays(event.target.value)}
              inputProps={{ min: 1, max: 365 }}
              helperText="Between 1 and 365 days"
            />
          )}

          <Alert severity="warning">
            Anyone with this link can read the file without signing in. Rotate{" "}
            <code>SHARE_SECRET</code> to invalidate all existing links.
          </Alert>

          {error && <Alert severity="error">{error}</Alert>}

          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress size={28} />
            </Box>
          ) : link ? (
            <Stack spacing={2}>
              <TextField
                label="Direct link"
                value={link.url}
                fullWidth
                size="small"
                InputProps={{
                  readOnly: true,
                  endAdornment: (
                    <Button
                      size="small"
                      startIcon={<ContentCopyIcon />}
                      onClick={() => void copy()}
                      sx={{ flex: "0 0 auto" }}
                    >
                      Copy
                    </Button>
                  ),
                }}
              />
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  p: 2,
                  backgroundColor: "#fff",
                  borderRadius: 2,
                }}
              >
                <QRCodeSVG value={link.url} size={168} />
              </Box>
              <Typography variant="body2" color="text.secondary">
                {link.expiresAt
                  ? `Expires ${formatDate(link.expiresAt)}`
                  : "This link does not expire."}
              </Typography>
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No link generated.
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button onClick={() => void generate()} disabled={loading || expiresIn === null}>
          Regenerate
        </Button>
        {link && (
          <Button
            variant="contained"
            startIcon={<OpenInNewIcon />}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
