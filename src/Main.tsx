import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import ContentPasteIcon from "@mui/icons-material/ContentPaste";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline";
import EditIcon from "@mui/icons-material/Edit";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RefreshIcon from "@mui/icons-material/Refresh";
import ShareIcon from "@mui/icons-material/Share";
import ViewListIcon from "@mui/icons-material/ViewList";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FileGrid from "./FileGrid";
import FileTable from "./FileTable";
import Header from "./Header";
import MultiSelectToolbar from "./MultiSelectToolbar";
import PathBreadcrumbs from "./PathBreadcrumbs";
import ProgressDialog from "./ProgressDialog";
import TextEditorDrawer from "./TextEditorDrawer";
import UploadDrawer, { UploadFab } from "./UploadDrawer";
import ConfirmDialog from "./dialogs/ConfirmDialog";
import DetailsDialog from "./dialogs/DetailsDialog";
import ShareDialog from "./dialogs/ShareDialog";
import TextInputDialog from "./dialogs/TextInputDialog";
import {
  apiErrorMessage,
  copyKey,
  createFolder,
  deleteKeys,
  downloadKey,
  fetchPath,
  moveKey,
  validateName,
  webdavUrl,
} from "./app/api";
import { copyText } from "./app/clipboard";
import { collectDroppedItems, ensureDroppedDirectories } from "./app/drop";
import { isTextLike } from "./app/mime";
import { useNotify } from "./app/notifications";
import { usePreferences, useResolvedTheme } from "./app/preferences";
import { useHashPath } from "./app/router";
import { sortFiles } from "./app/sort";
import { useTransferQueue, useUploadEnqueue } from "./app/transferQueue";
import {
  fileName,
  isDirectory,
  type FileAction,
  type FileItem,
  type SortField,
  type ViewMode,
} from "./app/types";

interface MenuState {
  file: FileItem;
  anchorEl?: HTMLElement;
  mouseX?: number;
  mouseY?: number;
}

interface ClipboardState {
  mode: "copy" | "move";
  files: FileItem[];
}

function LoadingState() {
  return (
    <Stack spacing={1} sx={{ p: { xs: 1, sm: 2 } }}>
      {Array.from({ length: 8 }).map((_, index) => (
        <Skeleton key={index} variant="rounded" height={48} />
      ))}
    </Stack>
  );
}

export default function Main() {
  const theme = useTheme();
  const isCompactView = useMediaQuery(theme.breakpoints.down("md"));
  const resolvedTheme = useResolvedTheme();
  const notify = useNotify();
  const { preferences, setSort, setView, setTheme } = usePreferences();
  const [cwd, navigate] = useHashPath();
  const [search, setSearch] = useState("");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [anchorKey, setAnchorKey] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorFile, setEditorFile] = useState<FileItem | null>(null);
  const [shareFile, setShareFile] = useState<FileItem | null>(null);
  const [detailsFile, setDetailsFile] = useState<FileItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameFile, setRenameFile] = useState<FileItem | null>(null);
  const [deleteFiles, setDeleteFiles] = useState<FileItem[]>([]);
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const completedTasks = useRef<Set<string>>(new Set());

  const transferTasks = useTransferQueue();
  const uploadEnqueue = useUploadEnqueue();

  const activeUploads = transferTasks.filter((task) =>
    ["pending", "in-progress"].includes(task.status)
  ).length;

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const items = await fetchPath(cwd, controller.signal);
      if (controller.signal.aborted) return;
      setFiles(items);
      setSelectedKeys([]);
      setAnchorKey(null);
    } catch (loadError) {
      if (controller.signal.aborted) return;
      setError(apiErrorMessage(loadError));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [cwd]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  useEffect(() => {
    setSelectedKeys([]);
    setAnchorKey(null);
  }, [search]);

  useEffect(() => {
    let shouldReload = false;
    for (const task of transferTasks) {
      if (
        task.status === "completed" &&
        !completedTasks.current.has(task.id)
      ) {
        completedTasks.current.add(task.id);
        if (task.remoteKey.startsWith(cwd)) shouldReload = true;
      }
    }
    if (shouldReload) void load();
  }, [cwd, load, transferTasks]);

  const view: "list" | "grid" =
    preferences.view === "auto"
      ? isCompactView
        ? "grid"
        : "list"
      : preferences.view;

  const filteredFiles = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? files.filter(
          (file) =>
            fileName(file.key).toLowerCase().includes(query) ||
            file.key.toLowerCase().includes(query)
        )
      : files;
    return sortFiles(filtered, preferences.sort);
  }, [files, preferences.sort, search]);

  const selectedFiles = useMemo(
    () => files.filter((file) => selectedKeys.includes(file.key)),
    [files, selectedKeys]
  );

  const toggleSelect = useCallback(
    (file: FileItem, event: React.MouseEvent) => {
      const keys = filteredFiles.map((item) => item.key);
      if (event.shiftKey && anchorKey) {
        const start = keys.indexOf(anchorKey);
        const end = keys.indexOf(file.key);
        if (start >= 0 && end >= 0) {
          const range = keys.slice(
            Math.min(start, end),
            Math.max(start, end) + 1
          );
          setSelectedKeys((current) =>
            Array.from(new Set([...current, ...range]))
          );
          return;
        }
      }

      setAnchorKey(file.key);
      setSelectedKeys((current) =>
        current.includes(file.key)
          ? current.filter((key) => key !== file.key)
          : [...current, file.key]
      );
    },
    [anchorKey, filteredFiles]
  );

  const openFile = useCallback(
    (file: FileItem) => {
      if (isDirectory(file)) {
        navigate(file.key + "/");
        return;
      }
      window.open(webdavUrl(file.key), "_blank", "noopener,noreferrer");
    },
    [navigate]
  );

  const requestDelete = useCallback(
    (items: FileItem[]) => {
      if (!items.length) return;
      setDeleteFiles(items);
    },
    []
  );

  const requestRename = useCallback((file: FileItem) => {
    setRenameFile(file);
  }, []);

  const requestShare = useCallback(
    (file: FileItem) => {
      if (isDirectory(file)) {
        notify("Folder sharing is not supported yet. Share a single file.", "info");
        return;
      }
      setShareFile(file);
    },
    [notify]
  );

  const editFile = useCallback(
    (file: FileItem) => {
      if (isDirectory(file) || !isTextLike(file)) {
        notify("This file cannot be edited as text.", "info");
        return;
      }
      setEditorFile(file);
      setEditorOpen(true);
    },
    [notify]
  );

  const setClipboardFor = useCallback(
    (mode: "copy" | "move", file?: FileItem) => {
      const items = file
        ? selectedKeys.includes(file.key)
          ? selectedFiles
          : [file]
        : selectedFiles;
      if (!items.length) return;
      setClipboard({ mode, files: items });
      setSelectedKeys([]);
      setAnchorKey(null);
      notify(
        `${items.length} item${items.length === 1 ? "" : "s"} ${
          mode === "copy" ? "copied" : "cut"
        }`,
        "info"
      );
    },
    [notify, selectedFiles, selectedKeys]
  );

  const pasteClipboard = useCallback(async () => {
    if (!clipboard) return;
    const failures: string[] = [];

    for (const source of clipboard.files) {
      let name = fileName(source.key);
      let target = cwd + name;
      if (target === source.key || target + "/" === source.key) {
        if (clipboard.mode === "move") {
          failures.push(`${name}: already in this folder`);
          continue;
        }
        const dot = name.lastIndexOf(".");
        name =
          dot > 0
            ? `${name.slice(0, dot)} (copy)${name.slice(dot)}`
            : `${name} (copy)`;
        target = cwd + name;
      }

      try {
        if (clipboard.mode === "copy") {
          await copyKey(source.key, target, false);
        } else {
          await moveKey(source.key, target, false);
        }
      } catch (error) {
        failures.push(`${name}: ${apiErrorMessage(error)}`);
      }
    }

    if (failures.length) {
      notify(
        `Paste failed for ${failures.length} item(s). ${failures[0]}`,
        "error"
      );
    } else {
      notify(clipboard.mode === "copy" ? "Pasted" : "Moved", "success");
    }
    if (clipboard.mode === "move") setClipboard(null);
    await load();
  }, [clipboard, cwd, load, notify]);

  const handleAction = useCallback(
    (action: FileAction, file: FileItem) => {
      switch (action) {
        case "open":
          openFile(file);
          break;
        case "download":
          if (isDirectory(file)) notify("Folder download is not supported yet.", "info");
          else downloadKey(file.key);
          break;
        case "share":
          requestShare(file);
          break;
        case "edit":
          editFile(file);
          break;
        case "rename":
          requestRename(file);
          break;
        case "copy":
          setClipboardFor("copy", file);
          break;
        case "cut":
          setClipboardFor("move", file);
          break;
        case "delete": {
          const targets = selectedKeys.includes(file.key)
            ? selectedFiles
            : [file];
          requestDelete(targets);
          break;
        }
        case "details":
          setDetailsFile(file);
          break;
        case "copyPath":
          copyText(file.key)
            .then(() => notify("Path copied", "success"))
            .catch(() => notify("Could not copy the path", "error"));
          break;
        default:
          break;
      }
    },
    [
      editFile,
      notify,
      openFile,
      requestDelete,
      requestRename,
      requestShare,
      selectedFiles,
      selectedKeys,
      setClipboardFor,
    ]
  );

  const handleRowClick = useCallback(
    (file: FileItem, event: React.MouseEvent) => {
      if (
        selectedKeys.length > 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        toggleSelect(file, event);
        return;
      }
      openFile(file);
    },
    [openFile, selectedKeys.length, toggleSelect]
  );

  const handleContextMenu = useCallback(
    (event: React.MouseEvent, file: FileItem) => {
      event.preventDefault();
      event.stopPropagation();
      if (!selectedKeys.includes(file.key)) {
        setSelectedKeys([file.key]);
      }
      setAnchorKey(file.key);
      setMenu({
        file,
        mouseX: event.clientX,
        mouseY: event.clientY,
      });
    },
    [selectedKeys]
  );

  const handleMenu = useCallback(
    (event: React.MouseEvent, file: FileItem) => {
      event.preventDefault();
      event.stopPropagation();
      if (!selectedKeys.includes(file.key)) {
        setSelectedKeys([file.key]);
      }
      setAnchorKey(file.key);
      setMenu({ file, anchorEl: event.currentTarget as HTMLElement });
    },
    [selectedKeys]
  );

  const selectAll = useCallback(
    (checked: boolean) => {
      setSelectedKeys(checked ? filteredFiles.map((file) => file.key) : []);
      setAnchorKey(null);
    },
    [filteredFiles]
  );

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setTheme]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTextInput =
        target?.tagName === "TEXTAREA" ||
        Boolean(target?.isContentEditable) ||
        (target?.tagName === "INPUT" &&
          !["checkbox", "radio", "button", "submit"].includes(
            (target as HTMLInputElement).type
          ));
      if (isTextInput) return;

      if (event.key === "Escape") {
        setSelectedKeys([]);
        setMenu(null);
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        selectAll(true);
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
        if (selectedFiles.length > 0) {
          event.preventDefault();
          setClipboardFor("copy");
        }
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "x") {
        if (selectedFiles.length > 0) {
          event.preventDefault();
          setClipboardFor("move");
        }
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
        if (clipboard) {
          event.preventDefault();
          void pasteClipboard();
        }
      } else if (event.key === "Delete" && selectedFiles.length > 0) {
        requestDelete(selectedFiles);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    clipboard,
    pasteClipboard,
    requestDelete,
    selectAll,
    selectedFiles,
    setClipboardFor,
  ]);

  const onDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    dragCounter.current = 0;
    setDragging(false);
    try {
      const dropped = await collectDroppedItems(event.dataTransfer, cwd);
      if (!dropped.length) {
        notify("No files were found in the drop.", "info");
        return;
      }
      await ensureDroppedDirectories(dropped);
      uploadEnqueue(...dropped);
    } catch (error) {
      notify(apiErrorMessage(error), "error");
    }
  };

  const emptyMessage = search
    ? `No files match “${search}”.`
    : "This folder is empty.";

  return (
    <Box
      sx={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "background.default",
      }}
    >
      <Header
        search={search}
        onSearchChange={setSearch}
        onHome={() => navigate("")}
        onRefresh={() => void load()}
        onUpload={() => setShowUpload(true)}
        onCreateFolder={() => setCreateOpen(true)}
        onNewTextFile={() => {
          setEditorFile(null);
          setEditorOpen(true);
        }}
        onOpenProgress={() => setShowProgress(true)}
        onToggleTheme={toggleTheme}
        resolvedTheme={resolvedTheme}
        activeUploads={activeUploads}
      />

      <PathBreadcrumbs cwd={cwd} onNavigate={navigate} />

      <Box
        sx={{
          px: { xs: 1, sm: 2 },
          py: 0.75,
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          flexWrap: "wrap",
          borderBottom: 1,
          borderColor: "divider",
          backgroundColor: "background.paper",
        }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ mr: "auto" }}>
          {`${filteredFiles.length} item${filteredFiles.length === 1 ? "" : "s"}${
            search ? " · filtered" : ""
          }`}
        </Typography>

        <ToggleButtonGroup
          size="small"
          exclusive
          value={view}
          onChange={(_, value: ViewMode | null) => {
            if (value) setView(value);
          }}
          aria-label="View mode"
        >
          <ToggleButton value="list" aria-label="List view">
            <ViewListIcon fontSize="small" />
          </ToggleButton>
          <ToggleButton value="grid" aria-label="Grid view">
            <ViewModuleIcon fontSize="small" />
          </ToggleButton>
        </ToggleButtonGroup>

        <FormControl size="small" sx={{ minWidth: { xs: 108, sm: 128 } }}>
          <InputLabel id="sort-field">Sort</InputLabel>
          <Select
            labelId="sort-field"
            label="Sort"
            value={preferences.sort.field}
            onChange={(event) =>
              setSort({
                ...preferences.sort,
                field: event.target.value as SortField,
              })
            }
          >
            <MenuItem value="name">Name</MenuItem>
            <MenuItem value="modified">Modified</MenuItem>
            <MenuItem value="size">Size</MenuItem>
            <MenuItem value="type">Type</MenuItem>
          </Select>
        </FormControl>

        <Tooltip
          title={
            preferences.sort.direction === "asc"
              ? "Ascending — click for descending"
              : "Descending — click for ascending"
          }
        >
          <IconButton
            size="small"
            aria-label="Toggle sort direction"
            onClick={() =>
              setSort({
                ...preferences.sort,
                direction:
                  preferences.sort.direction === "asc" ? "desc" : "asc",
              })
            }
          >
            {preferences.sort.direction === "asc" ? (
              <ArrowUpwardIcon fontSize="small" />
            ) : (
              <ArrowDownwardIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>

        <Tooltip title="Refresh">
          <IconButton
            size="small"
            aria-label="Refresh"
            onClick={() => void load()}
          >
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {clipboard && (
        <Box
          sx={{
            px: { xs: 1, sm: 2 },
            py: 0.75,
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexWrap: "wrap",
            borderBottom: 1,
            borderColor: "divider",
            backgroundColor: "action.hover",
          }}
        >
          <Typography variant="body2" sx={{ mr: "auto" }}>
            {`${clipboard.files.length} item${
              clipboard.files.length === 1 ? "" : "s"
            } ${clipboard.mode === "copy" ? "copied" : "cut"}`}
          </Typography>
          <Button
            size="small"
            variant="contained"
            startIcon={<ContentPasteIcon />}
            onClick={() => void pasteClipboard()}
          >
            Paste here
          </Button>
          <Button size="small" onClick={() => setClipboard(null)}>
            Cancel
          </Button>
        </Box>
      )}

      <Box
        id="file-drop-zone"
        sx={{
          flex: 1,
          minHeight: 0,
          position: "relative",
          overflow: "auto",
          pb: selectedKeys.length ? 14 : 10,
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          dragCounter.current += 1;
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={() => {
          dragCounter.current = Math.max(0, dragCounter.current - 1);
          if (dragCounter.current === 0) setDragging(false);
        }}
        onDrop={(event) => void onDrop(event)}
      >
        {dragging && (
          <Box
            sx={{
              position: "absolute",
              inset: 12,
              zIndex: 10,
              border: 2,
              borderStyle: "dashed",
              borderColor: "primary.main",
              borderRadius: 3,
              backgroundColor: "background.paper",
              opacity: 0.96,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <Typography variant="h6" color="primary">
              Drop files to upload to {cwd || "/"}
            </Typography>
          </Box>
        )}

        {error ? (
          <Box sx={{ p: 2 }}>
            <Alert
              severity="error"
              action={
                <Button color="inherit" size="small" onClick={() => void load()}>
                  Retry
                </Button>
              }
            >
              {error}
            </Alert>
          </Box>
        ) : loading && files.length === 0 ? (
          <LoadingState />
        ) : filteredFiles.length === 0 ? (
          <Box
            sx={{
              py: 10,
              px: 2,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1,
            }}
          >
            <Typography variant="h6" color="text.secondary">
              {emptyMessage}
            </Typography>
            {!search && (
              <Button
                variant="contained"
                startIcon={<CreateNewFolderIcon />}
                onClick={() => setCreateOpen(true)}
              >
                New folder
              </Button>
            )}
          </Box>
        ) : isCompactView ? (
          <FileGrid
            files={filteredFiles}
            selected={selectedKeys}
            compact={view === "list"}
            onToggleSelect={toggleSelect}
            onRowClick={handleRowClick}
            onContextMenu={handleContextMenu}
            onMenu={handleMenu}
          />
        ) : view === "grid" ? (
          <FileGrid
            files={filteredFiles}
            selected={selectedKeys}
            onToggleSelect={toggleSelect}
            onRowClick={handleRowClick}
            onContextMenu={handleContextMenu}
            onMenu={handleMenu}
          />
        ) : (
          <FileTable
            files={filteredFiles}
            selected={selectedKeys}
            sort={preferences.sort}
            onSort={(field) =>
              setSort({
                ...preferences.sort,
                field,
                direction:
                  preferences.sort.field === field &&
                  preferences.sort.direction === "asc"
                    ? "desc"
                    : "asc",
              })
            }
            onToggleSelect={toggleSelect}
            onSelectAll={(event) => selectAll(event.target.checked)}
            onRowClick={handleRowClick}
            onContextMenu={handleContextMenu}
            onMenu={handleMenu}
          />
        )}
      </Box>

      {selectedKeys.length === 0 && (
        <UploadFab onClick={() => setShowUpload(true)} />
      )}

      <MultiSelectToolbar
        selected={selectedFiles}
        onClose={() => {
          setSelectedKeys([]);
          setAnchorKey(null);
        }}
        onDownload={() => {
          if (selectedFiles.length === 1) {
            handleAction("download", selectedFiles[0]);
          }
        }}
        onRename={() => {
          if (selectedFiles.length === 1) requestRename(selectedFiles[0]);
        }}
        onDelete={() => requestDelete(selectedFiles)}
        onShare={() => {
          if (selectedFiles.length === 1) requestShare(selectedFiles[0]);
        }}
      />

      <Menu
        open={Boolean(menu)}
        onClose={() => setMenu(null)}
        anchorEl={menu?.anchorEl ?? null}
        anchorReference={menu?.anchorEl ? "anchorEl" : "anchorPosition"}
        anchorPosition={
          menu
            ? { top: menu.mouseY ?? 0, left: menu.mouseX ?? 0 }
            : undefined
        }
      >
        {menu && (
          <>
            <MenuItem onClick={() => { setMenu(null); handleAction("open", menu.file); }}>
              <ListItemIcon><OpenInNewIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Open</ListItemText>
            </MenuItem>
            <MenuItem
              disabled={isDirectory(menu.file)}
              onClick={() => { setMenu(null); handleAction("download", menu.file); }}
            >
              <ListItemIcon><DownloadIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Download</ListItemText>
            </MenuItem>
            <MenuItem
              disabled={isDirectory(menu.file) || !isTextLike(menu.file)}
              onClick={() => { setMenu(null); handleAction("edit", menu.file); }}
            >
              <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Edit</ListItemText>
            </MenuItem>
            <MenuItem
              disabled={isDirectory(menu.file)}
              onClick={() => { setMenu(null); handleAction("share", menu.file); }}
            >
              <ListItemIcon><ShareIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Share / direct link</ListItemText>
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => { setMenu(null); handleAction("rename", menu.file); }}>
              <ListItemIcon><DriveFileRenameOutlineIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Rename</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => { setMenu(null); handleAction("copy", menu.file); }}>
              <ListItemIcon><ContentCopyIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Copy</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => { setMenu(null); handleAction("cut", menu.file); }}>
              <ListItemIcon><ContentCutIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Cut</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => { setMenu(null); handleAction("copyPath", menu.file); }}>
              <ListItemIcon><ContentCopyIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Copy path</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => { setMenu(null); handleAction("details", menu.file); }}>
              <ListItemIcon><InfoOutlinedIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Details</ListItemText>
            </MenuItem>
            <Divider />
            <MenuItem
              onClick={() => { setMenu(null); handleAction("delete", menu.file); }}
              sx={{ color: "error.main" }}
            >
              <ListItemIcon sx={{ color: "error.main" }}><DeleteIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Delete</ListItemText>
            </MenuItem>
          </>
        )}
      </Menu>

      <UploadDrawer
        open={showUpload}
        setOpen={setShowUpload}
        cwd={cwd}
        onCreateFolder={() => setCreateOpen(true)}
        onNewTextFile={() => {
          setEditorFile(null);
          setEditorOpen(true);
        }}
      />

      <ProgressDialog open={showProgress} onClose={() => setShowProgress(false)} />

      <TextEditorDrawer
        open={editorOpen}
        cwd={cwd}
        file={editorFile}
        onClose={() => setEditorOpen(false)}
        onSaved={() => void load()}
      />

      <ShareDialog
        open={Boolean(shareFile)}
        file={shareFile}
        onClose={() => setShareFile(null)}
      />

      <DetailsDialog file={detailsFile} onClose={() => setDetailsFile(null)} />

      <TextInputDialog
        open={createOpen}
        title="New folder"
        label="Folder name"
        confirmLabel="Create"
        validate={validateName}
        onClose={() => setCreateOpen(false)}
        onSubmit={async (name) => {
          await createFolder(cwd, name);
          setCreateOpen(false);
          notify("Folder created", "success");
          await load();
        }}
      />

      <TextInputDialog
        open={Boolean(renameFile)}
        title="Rename"
        label="New name"
        initialValue={renameFile ? fileName(renameFile.key) : ""}
        confirmLabel="Rename"
        validate={validateName}
        onClose={() => setRenameFile(null)}
        onSubmit={async (name) => {
          if (!renameFile) return;
          await moveKey(renameFile.key, cwd + name, false);
          setRenameFile(null);
          notify("Renamed", "success");
          await load();
        }}
      />

      <ConfirmDialog
        open={deleteFiles.length > 0}
        title="Delete files?"
        confirmLabel="Delete"
        destructive
        message={
          <>
            <Typography variant="body2" sx={{ mb: 1 }}>
              The following item(s) will be permanently deleted:
            </Typography>
            <Box component="ul" sx={{ pl: 2.5, my: 0 }}>
              {deleteFiles.map((file) => (
                <li key={file.key}>
                  <Typography variant="body2">{fileName(file.key)}</Typography>
                </li>
              ))}
            </Box>
            <Typography variant="body2" sx={{ mt: 1 }}>
              This action cannot be undone.
            </Typography>
          </>
        }
        onClose={() => setDeleteFiles([])}
        onConfirm={async () => {
          const failed = await deleteKeys(deleteFiles.map((file) => file.key));
          if (failed.length) {
            throw new Error(`Failed to delete ${failed.length} item(s).`);
          }
          setDeleteFiles([]);
          setSelectedKeys([]);
          notify("Deleted", "success");
          await load();
        }}
      />

      {loading && files.length > 0 && (
        <Box
          sx={{
            position: "fixed",
            bottom: 12,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 5,
          }}
        >
          <CircularProgress size={20} />
        </Box>
      )}
    </Box>
  );
}
