import {
  Button,
  Card,
  Drawer,
  Fab,
  Grid,
  Typography,
} from "@mui/material";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import DriveFolderUploadIcon from "@mui/icons-material/DriveFolderUpload";
import ImageIcon from "@mui/icons-material/Image";
import NoteAddIcon from "@mui/icons-material/NoteAdd";
import UploadIcon from "@mui/icons-material/Upload";
import React, { forwardRef, useCallback } from "react";
import { encodeKey } from "./app/types";
import { useUploadEnqueue } from "./app/transferQueue";

function ActionButton({
  icon,
  caption,
  onClick,
}: {
  icon: React.ReactNode;
  caption: string;
  onClick?: () => void;
}) {
  return (
    <Button
      color="inherit"
      sx={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
        py: 1.5,
        textTransform: "none",
      }}
      onClick={onClick}
    >
      {icon}
      <Typography variant="caption" color="text.secondary">
        {caption}
      </Typography>
    </Button>
  );
}

export const UploadFab = forwardRef<HTMLButtonElement, { onClick: () => void }>(
  function UploadFab({ onClick }, ref) {
    return (
      <Fab
        ref={ref}
        aria-label="Upload"
        variant="circular"
        color="primary"
        sx={{
          position: "fixed",
          right: 16,
          bottom: 16,
          color: "white",
          display: { xs: "flex", md: "none" },
        }}
        onClick={onClick}
      >
        <UploadIcon />
      </Fab>
    );
  }
);

export default function UploadDrawer({
  open,
  setOpen,
  cwd,
  onCreateFolder,
  onNewTextFile,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  cwd: string;
  onCreateFolder: () => void;
  onNewTextFile: () => void;
}) {
  const uploadEnqueue = useUploadEnqueue();

  const pick = useCallback(
    (kind: "file" | "image" | "folder" | "camera") => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      if (kind === "image") input.accept = "image/*,video/*";
      if (kind === "camera") {
        input.accept = "image/*";
        input.setAttribute("capture", "environment");
      }
      if (kind === "folder") input.setAttribute("webkitdirectory", "");

      input.onchange = async () => {
        const files = Array.from(input.files ?? []);
        if (!files.length) {
          setOpen(false);
          return;
        }

        if (kind === "folder") {
          const dirs = new Set<string>();
          for (const file of files) {
            const relative =
              (file as File & { webkitRelativePath?: string })
                .webkitRelativePath || "";
            const parts = relative.split("/").slice(0, -1);
            for (let index = 1; index <= parts.length; index++) {
              dirs.add(cwd + parts.slice(0, index).join("/") + "/");
            }
          }
          const ordered = [...dirs].sort(
            (a, b) =>
              a.split("/").length - b.split("/").length || a.localeCompare(b)
          );
          for (const dir of ordered) {
            await fetch(`/webdav/${encodeKey(dir.replace(/\/$/, ""))}`, {
              method: "MKCOL",
            }).catch(() => undefined);
          }
          uploadEnqueue(
            ...files.map((file) => {
              const relative =
                (file as File & { webkitRelativePath?: string })
                  .webkitRelativePath || "";
              const directory = relative.includes("/")
                ? relative.slice(0, relative.lastIndexOf("/") + 1)
                : "";
              return { file, basedir: cwd + directory };
            })
          );
        } else {
          uploadEnqueue(...files.map((file) => ({ file, basedir: cwd })));
        }
        setOpen(false);
      };
      input.click();
    },
    [cwd, setOpen, uploadEnqueue]
  );

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={() => setOpen(false)}
      PaperProps={{
        sx: {
          borderRadius: "16px 16px 0 0",
          width: { xs: "100%", sm: 480 },
          mx: "auto",
        },
      }}
    >
      <Card sx={{ p: 1.5 }} elevation={0}>
        <Grid container columns={{ xs: 3, sm: 6 }} spacing={0.5}>
          <Grid item xs={1}>
            <ActionButton
              icon={<UploadIcon fontSize="large" />}
              caption="Files"
              onClick={() => pick("file")}
            />
          </Grid>
          <Grid item xs={1}>
            <ActionButton
              icon={<DriveFolderUploadIcon fontSize="large" />}
              caption="Folder"
              onClick={() => pick("folder")}
            />
          </Grid>
          <Grid item xs={1}>
            <ActionButton
              icon={<ImageIcon fontSize="large" />}
              caption="Media"
              onClick={() => pick("image")}
            />
          </Grid>
          <Grid item xs={1}>
            <ActionButton
              icon={<CameraAltIcon fontSize="large" />}
              caption="Camera"
              onClick={() => pick("camera")}
            />
          </Grid>
          <Grid item xs={1}>
            <ActionButton
              icon={<CreateNewFolderIcon fontSize="large" />}
              caption="New folder"
              onClick={() => {
                setOpen(false);
                onCreateFolder();
              }}
            />
          </Grid>
          <Grid item xs={1}>
            <ActionButton
              icon={<NoteAddIcon fontSize="large" />}
              caption="New text"
              onClick={() => {
                setOpen(false);
                onNewTextFile();
              }}
            />
          </Grid>
        </Grid>
      </Card>
    </Drawer>
  );
}
