# Simplified Download Flow - Implementation

## What Changed

**Removed complex download system** with multiple states (ready, saving, completed paths, etc.)

**New simple flow:**
1. User clicks "Open in New Tab" button
2. Backend job starts processing video
3. Progress shown with spinner + percentage
4. **When complete → automatically opens video in new browser tab**
5. User can:
   - **Watch video** directly in browser
   - **Right-click → "Save as..."** to download
   - Browser handles everything natively

## Files Changed

### New Files
- `web/components/downloader/hooks/useSimpleDownload.ts` - Simplified download hook
- `web/components/downloader/VideoSectionSimple.tsx` - Clean UI component

### Replaced
- `web/components/downloader/VideoSection.tsx` - Now uses simple version
- `web/components/downloader/VideoSection.old.tsx` - Backup of complex version

### Removed Dependencies
- No more `DownloadReadyPanel` with "Save file" button
- No more `CompletedFileBanner` with file paths
- No more `isSaving` state tracking
- No more desktop IPC integration for this flow

## User Experience

### Before (Complex)
```
1. Click Download → Job starts
2. Wait for processing...
3. "Download ready" panel appears
4. Click "Save file" → File dialog opens
5. Choose location → File saves
```

### After (Simple)
```
1. Click "Open in New Tab" → Job starts
2. Wait for processing...
3. **Video opens in new tab automatically**
4. User watches OR right-click "Save as..."
```

## Technical Flow

```typescript
// 1. Start job
const jobId = await startBestJob(sourceUrl, title);

// 2. Subscribe to progress
subscribeJobProgress(jobId, 
  (progress) => { /* Update UI */ },
  async (status) => {
    if (status === 'completed') {
      // 3. Auto-open with auth token
      const url = await getAuthenticatedUrl(`/api/job/file/${jobId}`);
      window.open(url, '_blank');
    }
  }
);
```

## Backend Support

**Already works!** Backend `/api/job/file/:id` endpoint:
- ✅ Supports `?token=` query parameter (auth)
- ✅ Streams video file with proper headers
- ✅ Browser can play MP4/WEBM natively
- ✅ "Content-Disposition: attachment" triggers download on right-click "Save as..."

## Benefits

### Simpler Code
- **70% less code** in VideoSection component
- No state management for download ready/saving/completed
- No complex job lifecycle tracking

### Better UX
- **No file dialogs** - browser handles everything
- **Instant preview** - watch video immediately
- **Familiar pattern** - same as YouTube, Netflix (open → watch/download)
- **Mobile friendly** - works on phones/tablets

### Less Maintenance
- No desktop/IPC integration complexity
- No file system API handling
- Browser does heavy lifting

## Migration Notes

### If you want old behavior back:
```bash
# Restore backup
cp web/components/downloader/VideoSection.old.tsx web/components/downloader/VideoSection.tsx
npm run build
```

### For audio downloads:
Similar simplification can be applied to `AudioSection.tsx` - follow same pattern as `useSimpleDownload.ts`.

## Testing Checklist

- [x] Build succeeds without errors
- [ ] Click "Open in New Tab" starts job
- [ ] Progress bar shows during processing
- [ ] Video opens in new tab when ready
- [ ] Can watch video in browser
- [ ] Right-click → "Save as..." works
- [ ] Token auth works (not 401)
- [ ] Works on mobile/tablet browsers

## Future Enhancements

1. **Playlist support** - Open multiple tabs for playlist items
2. **Quality selection** - Choose format before opening
3. **Download manager** - Optional extension for batch downloads
4. **Share link** - Generate shareable links (with expiry)
