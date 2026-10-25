import {
  Box,
  Card,
  Checkbox,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import React from "react";
import MimeIcon from "./MimeIcon";
import { friendlyType } from "./app/mime";
import { fileName, isDirectory, type FileItem } from "./app/types";
import { formatDateShort, humanReadableSize } from "./app/utils";

export interface FileGridProps {
  files: FileItem[];
  selected: string[];
  compact?: boolean;
  onToggleSelect: (file: FileItem, event: React.MouseEvent) => void;
  onRowClick: (file: FileItem, event: React.MouseEvent) => void;
  onContextMenu: (event: React.MouseEvent, file: FileItem) => void;
  onMenu: (event: React.MouseEvent, file: FileItem) => void;
}

function Thumbnail({ file }: { file: FileItem }) {
  const thumbnail = file.customMetadata?.thumbnail;
  if (thumbnail) {
    return (
      <Box
        component="img"
        src={`/webdav/_$flaredrive$/thumbnails/${thumbnail}.png`}
        alt=""
        loading="lazy"
        sx={{
          width: 40,
          height: 40,
          objectFit: "cover",
          borderRadius: 1,
          flex: "0 0 auto",
        }}
      />
    );
  }
  return (
    <Box sx={{ color: "text.secondary", display: "flex", flex: "0 0 auto" }}>
      <MimeIcon file={file} />
    </Box>
  );
}

function FileGrid({
  files,
  selected,
  compact = false,
  onToggleSelect,
  onRowClick,
  onContextMenu,
  onMenu,
}: FileGridProps) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: compact
          ? "1fr"
          : {
              xs: "repeat(2, minmax(0, 1fr))",
              sm: "repeat(auto-fill, minmax(180px, 1fr))",
            },
        gap: compact ? 0.5 : { xs: 1, sm: 1.5 },
        p: { xs: 1, sm: 1.5 },
      }}
    >
      {files.map((file) => {
        const isSelected = selected.includes(file.key);
        if (compact) {
          return (
            <Card
              key={file.key}
              variant="outlined"
              onClick={(event) => onRowClick(file, event)}
              onContextMenu={(event) => onContextMenu(event, file)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                px: 1,
                py: 0.75,
                cursor: "pointer",
                borderColor: isSelected ? "primary.main" : "divider",
                backgroundColor: isSelected ? "action.selected" : "background.paper",
              }}
            >
              <Checkbox
                size="small"
                checked={isSelected}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleSelect(file, event);
                }}
                inputProps={{ "aria-label": `Select ${fileName(file.key)}` }}
              />
              <Thumbnail file={file} />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" noWrap fontWeight={500}>
                  {fileName(file.key)}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {friendlyType(file)}
                  {!isDirectory(file) ? ` · ${humanReadableSize(file.size)}` : ""}
                  {` · ${formatDateShort(file.uploaded)}`}
                </Typography>
              </Box>
              <IconButton
                size="small"
                aria-label={`Actions for ${fileName(file.key)}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onMenu(event, file);
                }}
              >
                <MoreVertIcon fontSize="small" />
              </IconButton>
            </Card>
          );
        }

        return (
          <Card
            key={file.key}
            variant="outlined"
            onClick={(event) => onRowClick(file, event)}
            onContextMenu={(event) => onContextMenu(event, file)}
                        sx={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              gap: 1,
              p: { xs: 1, sm: 1.5 },
              minWidth: 0,
              cursor: "pointer",
              borderColor: isSelected ? "primary.main" : "divider",
              backgroundColor: isSelected ? "action.selected" : "background.paper",
              transition: "border-color 120ms ease, background-color 120ms ease",
              "&:hover": { borderColor: "primary.light" },
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 0.5,
              }}
            >
              <Checkbox
                size="small"
                checked={isSelected}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleSelect(file, event);
                }}
                inputProps={{ "aria-label": `Select ${fileName(file.key)}` }}
              />
              <IconButton
                size="small"
                aria-label={`Actions for ${fileName(file.key)}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onMenu(event, file);
                }}
              >
                <MoreVertIcon fontSize="small" />
              </IconButton>
            </Box>

            <Box sx={{ display: "flex", justifyContent: "center", py: 0.5 }}>
              <Thumbnail file={file} />
            </Box>

            <Box sx={{ minWidth: 0 }}>
              <Tooltip title={fileName(file.key)}>
                <Typography variant="body2" noWrap fontWeight={500}>
                  {fileName(file.key)}
                </Typography>
              </Tooltip>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Typography variant="caption" color="text.secondary" noWrap>
                  {friendlyType(file)}
                </Typography>
                {!isDirectory(file) && (
                  <>
                    <Typography variant="caption" color="text.secondary">
                      ·
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {humanReadableSize(file.size)}
                    </Typography>
                  </>
                )}
              </Stack>
              <Typography variant="caption" color="text.secondary" noWrap>
                {formatDateShort(file.uploaded)}
              </Typography>
            </Box>
          </Card>
        );
      })}
    </Box>
  );
}

export default FileGrid;
