import { Box, Breadcrumbs, Button, Link, Typography } from "@mui/material";
import HomeIcon from "@mui/icons-material/Home";
import React from "react";

export default function PathBreadcrumbs({
  cwd,
  onNavigate,
}: {
  cwd: string;
  onNavigate: (path: string) => void;
}) {
  const parts = cwd.replace(/\/$/, "").split("/").filter(Boolean);

  return (
    <Box
      sx={{
        px: { xs: 1, sm: 2 },
        py: 0.75,
        overflowX: "auto",
        whiteSpace: "nowrap",
        borderBottom: 1,
        borderColor: "divider",
        backgroundColor: "background.paper",
      }}
    >
      <Breadcrumbs separator="›" aria-label="Breadcrumb" sx={{ "& ol": { flexWrap: "nowrap" } }}>
        <Button
          size="small"
          onClick={() => onNavigate("")}
          sx={{ minWidth: 0, p: 0.5, color: parts.length ? "text.secondary" : "text.primary" }}
          aria-label="Home"
        >
          <HomeIcon fontSize="small" />
        </Button>
        {parts.map((part, index) => {
          const path = parts.slice(0, index + 1).join("/") + "/";
          const isLast = index === parts.length - 1;
          return isLast ? (
            <Typography key={path} color="text.primary" variant="body2" fontWeight={600}>
              {part}
            </Typography>
          ) : (
            <Link
              key={path}
              component="button"
              variant="body2"
              underline="hover"
              color="text.secondary"
              onClick={() => onNavigate(path)}
            >
              {part}
            </Link>
          );
        })}
      </Breadcrumbs>
    </Box>
  );
}
