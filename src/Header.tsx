import {
  AppBar,
  Badge,
  Box,
  Button,
  Divider,
  IconButton,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import CloudIcon from "@mui/icons-material/Cloud";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import NoteAddIcon from "@mui/icons-material/NoteAdd";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import UploadIcon from "@mui/icons-material/Upload";
import ClearIcon from "@mui/icons-material/Clear";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import React, { useState } from "react";

export interface HeaderProps {
  search: string;
  onSearchChange: (value: string) => void;
  onHome: () => void;
  onRefresh: () => void;
  onUpload: () => void;
  onCreateFolder: () => void;
  onNewTextFile: () => void;
  onOpenProgress: () => void;
  onToggleTheme: () => void;
  resolvedTheme: "light" | "dark";
  activeUploads: number;
}

export default function Header({
  search,
  onSearchChange,
  onHome,
  onRefresh,
  onUpload,
  onCreateFolder,
  onNewTextFile,
  onOpenProgress,
  onToggleTheme,
  resolvedTheme,
  activeUploads,
}: HeaderProps) {
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  const menuItems = (
    <>
      <MenuItem
        onClick={() => {
          setMenuAnchor(null);
          onCreateFolder();
        }}
      >
        <ListItemIcon>
          <CreateNewFolderIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>New folder</ListItemText>
      </MenuItem>
      <MenuItem
        onClick={() => {
          setMenuAnchor(null);
          onNewTextFile();
        }}
      >
        <ListItemIcon>
          <NoteAddIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>New text file</ListItemText>
      </MenuItem>
      <MenuItem
        onClick={() => {
          setMenuAnchor(null);
          onOpenProgress();
        }}
      >
        <ListItemIcon>
          <CloudUploadIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Upload progress</ListItemText>
      </MenuItem>
      <Divider />
      <MenuItem
        onClick={() => {
          setMenuAnchor(null);
          onToggleTheme();
        }}
      >
        <ListItemIcon>
          {resolvedTheme === "dark" ? (
            <LightModeIcon fontSize="small" />
          ) : (
            <DarkModeIcon fontSize="small" />
          )}
        </ListItemIcon>
        <ListItemText>
          {resolvedTheme === "dark" ? "Light theme" : "Dark theme"}
        </ListItemText>
      </MenuItem>
    </>
  );

  return (
    <AppBar
      position="static"
      color="inherit"
      elevation={0}
      sx={{
        borderBottom: 1,
        borderColor: "divider",
        backgroundColor: "background.paper",
      }}
    >
      <Toolbar
        disableGutters
        sx={{
          px: { xs: 1, sm: 2 },
          py: 1,
          gap: 1,
          flexWrap: "wrap",
          minHeight: "unset",
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          spacing={0.75}
          sx={{ cursor: "pointer", order: 1 }}
          onClick={onHome}
        >
          <CloudIcon color="primary" />
          <Typography variant="h6" fontWeight={700} sx={{ letterSpacing: -0.5 }}>
            r2dav
          </Typography>
        </Stack>

        <Box
          sx={{
            order: { xs: 3, sm: 2 },
            flex: { xs: "1 0 100%", sm: 1 },
            minWidth: 0,
            maxWidth: { sm: 560 },
          }}
        >
          <TextField
            size="small"
            fullWidth
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search current folder…"
            inputProps={{ "aria-label": "Search current folder" }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: search ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    aria-label="Clear search"
                    onClick={() => onSearchChange("")}
                  >
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
              sx: { borderRadius: 999, backgroundColor: "action.hover" },
            }}
          />
        </Box>

        <Stack
          direction="row"
          alignItems="center"
          spacing={0.5}
          sx={{ order: { xs: 2, sm: 3 }, ml: "auto" }}
        >
          <Tooltip title="Upload">
            <IconButton
              color="primary"
              aria-label="Upload"
              onClick={onUpload}
              sx={{ display: { xs: "inline-flex", sm: "none" } }}
            >
              <UploadIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            size="small"
            startIcon={<UploadIcon />}
            onClick={onUpload}
            sx={{ display: { xs: "none", sm: "inline-flex" }, borderRadius: 999 }}
          >
            Upload
          </Button>
          <Tooltip title="New folder">
            <IconButton
              aria-label="New folder"
              onClick={onCreateFolder}
              sx={{ display: { xs: "none", sm: "inline-flex" } }}
            >
              <CreateNewFolderIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Refresh">
            <IconButton aria-label="Refresh" onClick={onRefresh}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Upload progress">
            <IconButton aria-label="Upload progress" onClick={onOpenProgress}>
              <Badge badgeContent={activeUploads} color="primary" max={99}>
                <CloudUploadIcon />
              </Badge>
            </IconButton>
          </Tooltip>
          <Tooltip title={resolvedTheme === "dark" ? "Light theme" : "Dark theme"}>
            <IconButton aria-label="Toggle theme" onClick={onToggleTheme}>
              {resolvedTheme === "dark" ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>
          </Tooltip>
          <IconButton
            aria-label="More actions"
            aria-controls={menuAnchor ? "more-menu" : undefined}
            aria-haspopup="true"
            onClick={(event) => setMenuAnchor(event.currentTarget)}
          >
            <MoreVertIcon />
          </IconButton>
        </Stack>
      </Toolbar>

      <Menu
        id="more-menu"
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        {menuItems}
      </Menu>
    </AppBar>
  );
}
