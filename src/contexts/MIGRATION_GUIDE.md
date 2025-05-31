# HomeContext Split Migration Guide

## Overview
This guide explains how to migrate from the monolithic HomeContext to smaller, focused contexts.

## Benefits of Splitting
1. **Performance**: Components only re-render when their specific context changes
2. **Maintainability**: Easier to understand what each context is responsible for
3. **Testing**: Smaller contexts are easier to mock and test
4. **Type Safety**: More focused interfaces reduce confusion

## New Context Structure

### 1. TileManagementContext
Manages tile download functionality:
- Download states (mode, progress, areas)
- Tile download actions
- Tile maps configuration

### 2. MapMemoContext
Handles map annotation tools:
- Drawing tool states (pen, eraser, stamps)
- Color and width settings
- Undo/redo functionality
- Map memo lines data

### 3. InfoToolContext
Manages information display tools:
- Info tool selection
- Vector tile information
- Modal visibility states

### 4. DataSelectionContext
Handles data selection states:
- Point, line, and polygon datasets (read-only)
- Selected record information
- Editing state

### 5. AppStateContext
General application states and navigation:
- Online/offline status
- Loading states
- Navigation functions
- User information
- Bottom sheet reference

## Migration Steps

### Step 1: Create New Context Files
Create the new context files as shown in the examples above.

### Step 2: Update Container (Backward Compatible)
```tsx
// Keep HomeContext for backward compatibility
import { HomeContext } from '../contexts/Home';
// Import new contexts
import { TileManagementContext } from '../contexts/TileManagement';
// ... other imports

// In your container:
return (
  // Existing providers...
  <HomeContext.Provider value={homeContextValue}>
    {/* Add new context providers inside */}
    <TileManagementContext.Provider value={tileManagementValue}>
      <MapMemoContext.Provider value={mapMemoValue}>
        {/* ... other new providers */}
        <Home />
      </MapMemoContext.Provider>
    </TileManagementContext.Provider>
  </HomeContext.Provider>
);
```

### Step 3: Gradually Update Components
Update components one by one to use the new contexts:

#### Before:
```tsx
import { useContext } from 'react';
import { HomeContext } from '../../contexts/Home';

const MyComponent = () => {
  const { 
    currentMapMemoTool,
    penColor,
    downloadProgress,
    user,
    // ... many other values
  } = useContext(HomeContext);
  
  // Component logic
};
```

#### After:
```tsx
import { useContext } from 'react';
import { MapMemoContext } from '../../contexts/MapMemo';
import { TileManagementContext } from '../../contexts/TileManagement';
import { AppStateContext } from '../../contexts/AppState';

const MyComponent = () => {
  // Only import what you need
  const { currentMapMemoTool, penColor } = useContext(MapMemoContext);
  const { downloadProgress } = useContext(TileManagementContext);
  const { user } = useContext(AppStateContext);
  
  // Component logic
};
```

### Step 4: Remove HomeContext
Once all components are migrated:
1. Remove HomeContext.Provider from the container
2. Delete the old HomeContext file
3. Remove any remaining imports

## Best Practices

### 1. Use Custom Hooks
Create custom hooks for common context combinations:

```tsx
// hooks/useMapMemo.ts
export const useMapMemoContext = () => {
  const context = useContext(MapMemoContext);
  if (!context) {
    throw new Error('useMapMemoContext must be used within MapMemoProvider');
  }
  return context;
};
```

### 2. Memoize Context Values
Always memoize context values to prevent unnecessary re-renders:

```tsx
const tileManagementValue = useMemo(
  () => ({
    // values...
  }),
  [/* dependencies */]
);
```

### 3. Group Related Data
Keep related data together to minimize the number of contexts a component needs:

```tsx
// Good: All map memo data in one context
const { penColor, penWidth, currentTool } = useContext(MapMemoContext);

// Avoid: Spreading related data across contexts
const { penColor } = useContext(ColorContext);
const { penWidth } = useContext(WidthContext);
const { currentTool } = useContext(ToolContext);
```

## Testing

### Mocking Split Contexts
```tsx
const mockMapMemoContext = {
  currentMapMemoTool: 'PEN',
  penColor: '#000000',
  // ... other values
};

const wrapper = ({ children }) => (
  <MapMemoContext.Provider value={mockMapMemoContext}>
    {children}
  </MapMemoContext.Provider>
);

const { result } = renderHook(() => useMapMemoContext(), { wrapper });
```

## Troubleshooting

### Common Issues
1. **Missing Provider Error**: Ensure all contexts are provided at the appropriate level
2. **Stale Values**: Check that all dependencies are included in useMemo
3. **Type Errors**: Update imports to use the new context types

### Performance Monitoring
Use React DevTools Profiler to verify that splitting contexts reduces re-renders:
1. Record a profile before migration
2. Record after migration
3. Compare render counts for components