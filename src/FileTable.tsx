import {
  Box,
  Checkbox,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import React from "react";
import MimeIcon from "./MimeIcon";
import { friendlyType } from "./app/mime";
import {
  fileName,
  isDirectory,
  type FileItem,
  type SortField,
  type SortState,
} from "./app/types";
import { formatDate, humanReadableSize } from "./app/utils";

export interface FileTableProps {
  files: FileItem[];
  selected: string[];
  sort: SortState;
  onSort: (field: SortField) => void;
  onToggleSelect: (file: FileItem, event: React.MouseEvent) => void;
  onSelectAll: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRowClick: (file: FileItem, event: React.MouseEvent) => void;
  onContextMenu: (event: React.MouseEvent, file: FileItem) => void;
  onMenu: (event: React.MouseEvent, file: FileItem) => void;
}

function SortCell({
  field,
  label,
  sort,
  onSort,
  align,
}: {
  field: SortField;
  label: string;
  sort: SortState;
  onSort: (field: SortField) => void;
  align?: "left" | "right";
}) {
  return (
    <TableCell align={align} sortDirection={sort.field === field ? sort.direction : false}>
      <TableSortLabel
        active={sort.field === field}
        direction={sort.field === field ? sort.direction : "asc"}
        onClick={() => onSort(field)}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );
}

function FileTable({
  files,
  selected,
  sort,
  onSort,
  onToggleSelect,
  onSelectAll,
  onRowClick,
  onContextMenu,
  onMenu,
}: FileTableProps) {
  const allSelected = files.length > 0 && files.every((file) => selected.includes(file.key));
  const someSelected = files.some((file) => selected.includes(file.key));

  return (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table size="small" stickyHeader aria-label="Files">
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox">
              <Checkbox
                size="small"
                checked={allSelected}
                indeterminate={!allSelected && someSelected}
                onChange={onSelectAll}
                inputProps={{ "aria-label": "Select all files" }}
              />
            </TableCell>
            <SortCell field="name" label="Name" sort={sort} onSort={onSort} />
            <SortCell
              field="type"
              label="Type"
              sort={sort}
              onSort={onSort}
            />
            <SortCell
              field="size"
              label="Size"
              sort={sort}
              onSort={onSort}
              align="right"
            />
            <SortCell
              field="modified"
              label="Modified"
              sort={sort}
              onSort={onSort}
            />
            <TableCell align="right" padding="checkbox">
              Actions
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {files.map((file) => {
            const isSelected = selected.includes(file.key);
            return (
              <TableRow
                key={file.key}
                hover
                selected={isSelected}
                onClick={(event) => onRowClick(file, event)}
                onContextMenu={(event) => onContextMenu(event, file)}
                sx={{ cursor: "pointer" }}
              >
                <TableCell padding="checkbox">
                  <Checkbox
                    size="small"
                    checked={isSelected}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleSelect(file, event);
                    }}
                    inputProps={{ "aria-label": `Select ${fileName(file.key)}` }}
                  />
                </TableCell>
                <TableCell sx={{ maxWidth: 0, width: "50%" }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                    {file.customMetadata?.thumbnail ? (
                      <Box
                        component="img"
                        src={`/webdav/_$flaredrive$/thumbnails/${file.customMetadata.thumbnail}.png`}
                        alt=""
                        loading="lazy"
                        sx={{
                          width: 32,
                          height: 32,
                          objectFit: "cover",
                          borderRadius: 0.75,
                          flex: "0 0 auto",
                        }}
                      />
                    ) : (
                      <Box sx={{ color: "text.secondary", display: "flex" }}>
                        <MimeIcon file={file} fontSize="small" />
                      </Box>
                    )}
                    <Typography variant="body2" noWrap fontWeight={isDirectory(file) ? 500 : 400}>
                      {fileName(file.key)}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell sx={{ display: { xs: "none", sm: "table-cell" }, color: "text.secondary", whiteSpace: "nowrap" }}>
                  {friendlyType(file)}
                </TableCell>
                <TableCell
                  align="right"
                  sx={{ display: { xs: "none", sm: "table-cell" }, color: "text.secondary", whiteSpace: "nowrap" }}
                >
                  {isDirectory(file) ? "—" : humanReadableSize(file.size)}
                </TableCell>
                <TableCell
                  sx={{ display: { xs: "none", md: "table-cell" }, color: "text.secondary", whiteSpace: "nowrap" }}
                >
                  {formatDate(file.uploaded)}
                </TableCell>
                <TableCell align="right" padding="checkbox">
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
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default FileTable;
