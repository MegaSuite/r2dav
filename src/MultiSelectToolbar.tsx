import {
  Box,
  Button,
  Divider,
  IconButton,
  Paper,
  Slide,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline";
import ShareIcon from "@mui/icons-material/Share";
import React from "react";
import { isDirectory, type FileItem } from "./app/types";

export default function MultiSelectToolbar({
  selected,
  onClose,
  onDownload,
  onRename,
  onDelete,
  onShare,
}: {
  selected: FileItem[];
  onClose: () => void;
  onDownload: () => void;
  onRename: () => void;
  onDelete: () => void;
  onShare: () => void;
}) {
  const count = selected.length;
  const single = count === 1 ? selected[0] : null;
  const singleFile = single && !isDirectory(single) ? single : null;

  return (
    <Slide direction="up" in={count > 0} mountOnEnter unmountOnExit>
      <Paper
        elevation={8}
        sx={{
          position: "fixed",
          bottom: { xs: 0, md: 24 },
          left: { xs: 0, md: "50%" },
          right: { xs: 0, md: "auto" },
          transform: { md: "translateX(-50%)" },
          zIndex: (theme) => theme.zIndex.fab,
          borderRadius: { xs: "16px 16px 0 0", md: 999 },
          border: 1,
          borderColor: "divider",
          px: 1,
          py: 0.5,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <IconButton aria-label="Cancel selection" onClick={onClose}>
            <CloseIcon />
          </IconButton>
          <Typography variant="body2" fontWeight={600} sx={{ px: 0.5, whiteSpace: "nowrap" }}>
            {count} selected
          </Typography>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <Tooltip title={singleFile ? "Download" : "Select one file"}>
            <span>
              <IconButton
                aria-label="Download"
                color="primary"
                disabled={!singleFile}
                onClick={onDownload}
              >
                <DownloadIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={singleFile ? "Share" : "Select one file"}>
            <span>
              <IconButton
                aria-label="Share"
                color="primary"
                disabled={!singleFile}
                onClick={onShare}
              >
                <ShareIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={single ? "Rename" : "Select one item"}>
            <span>
              <IconButton
                aria-label="Rename"
                color="primary"
                disabled={!single}
                onClick={onRename}
                sx={{ display: { xs: "none", sm: "inline-flex" } }}
              >
                <DriveFileRenameOutlineIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton aria-label="Delete" color="error" onClick={onDelete}>
              <DeleteIcon />
            </IconButton>
          </Tooltip>
          <Box sx={{ display: { xs: "none", md: "block" }, pl: 1 }}>
            <Button size="small" onClick={onClose}>
              Done
            </Button>
          </Box>
        </Stack>
      </Paper>
    </Slide>
  );
}
