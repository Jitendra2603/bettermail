# Project Structure Documentation

This document provides a detailed overview of the project's directory structure and functionality based on code review.

## Core Application Structure

### `/app` Directory (Next.js 13+ App Router)

#### API Routes (`/app/api/`)
- `/chat` - Handles AI-powered chat functionality using OpenAI/Braintrust
  - Supports one-on-one and group chat scenarios
  - Manages message reactions and conversation flow
  - Uses GPT-4 for generating contextual responses
- `/emails` - Email management endpoints
  - Handles email reading, marking as read, and replying
  - Manages email attachments and threading
- `/auth` - Authentication endpoints
- `/sync` - Data synchronization endpoints
- `/watch` - Real-time update monitoring
- `/upload` - File upload handling
- `/validate-contact` - Contact validation endpoints
- `/og` - Open Graph image generation

#### Pages
- `/login` - Authentication and user onboarding
- `/messages` - Main messaging interface
- `layout.tsx` - Root layout with common UI elements
- `page.tsx` - Main application entry point

#### Styling
- `globals.css` - Global styles and Tailwind utilities
- `tiptap.css` - Rich text editor styling

### `/components` Directory

#### Core Components
- `app.tsx` - Main application shell
  - Manages routing and global state
  - Handles authentication flow
  - Coordinates real-time updates

#### Messaging Components
- `message-bubble.tsx` - Message display component
  - Supports text, rich media, and attachments
  - Handles message reactions
  - Manages message states (sending, delivered, etc.)
- `chat-header.tsx` - Conversation header
  - Shows participant information
  - Manages conversation settings
  - Handles group chat controls
- `message-input.tsx` - Message composition
  - Rich text editing
  - File attachment handling
  - Message drafts
- `chat-area.tsx` - Main chat interface
  - Message list virtualization
  - Scroll management
  - Real-time updates

#### Navigation and UI
- `sidebar.tsx` - Main navigation component
  - Conversation list
  - Contact management
  - Settings access
- `nav.tsx` - Top navigation bar
- `theme-toggle.tsx` - Dark/light mode switching
- `search-bar.tsx` - Global search functionality
- `command-menu.tsx` - Command palette (keyboard shortcuts)

#### Security
- `ProtectedRoute.tsx` - Authentication wrapper
  - Route protection
  - Permission checking
  - Redirect handling

### `/lib` Directory (Core Utilities)

#### Email Integration
- `gmail.ts` - Gmail API integration
  - Email synchronization
  - Message threading
  - Attachment handling
  - Read/unread status management
  - Reply functionality
  - Real-time updates via Gmail push notifications

#### Firebase Integration
- `firebase.ts` - Firebase client configuration
  - Authentication setup
  - Firestore initialization
  - Storage configuration
- `firebase-admin.ts` - Server-side Firebase admin
  - Secure operations
  - Background tasks
  - Data management

#### Utilities
- `message-queue.ts` - Message processing
  - Reliable message delivery
  - Retry logic
  - Error handling
- `contacts.ts` - Contact management
- `sound-effects.ts` - Audio notifications
- `utils.ts` - Common utilities

## Configuration Files

### Firebase Configuration
- `firebase.json` - Firebase service configuration
- `.firebaserc` - Project settings
- `firestore.rules` - Security rules for database
- `firestore.indexes.json` - Query optimization
- `storage.rules` - File storage security

### Next.js Configuration
- `next.config.js` - Next.js settings
  - API routes
  - Image optimization
  - Environment variables
- `next.config.ts` - TypeScript configuration

### Development Configuration
- `.env.local` - Environment variables
- `.eslintrc.json` - Code style enforcement
- `tsconfig.json` - TypeScript settings
- `postcss.config.js` - CSS processing
- `tailwind.config.ts` - UI framework configuration

## Additional Features

### Real-time Functionality
- WebSocket connections for instant updates
- Push notifications
- Presence indicators
- Typing indicators

### Data Synchronization
- Offline support
- Background sync
- Conflict resolution
- Data persistence

### Security Features
- End-to-end encryption support
- Secure file handling
- Authentication flow
- Permission management

## Build and Deployment

### GitHub Actions
- Automated deployments to Firebase
- Pull request previews
- Integration testing
- Security scanning

### Firebase Hosting
- Global CDN distribution
- SSL certification
- Cache optimization
- Performance monitoring

## Development Notes

### Performance Optimizations
- Message virtualization
- Lazy loading
- Image optimization
- Caching strategies

### Security Considerations
- API key management
- Authentication flow
- Data encryption
- File upload scanning

## Additional Directories

### `/hooks` (Custom React Hooks)

#### Email Management
- `useEmailSync.ts` - Email synchronization hook
  - Real-time Gmail integration
  - Push notification setup
  - Email thread management
  - Conversation state management
  - Unread count tracking
  - Optimized querying with fallback support
  - Attachment handling

#### Authentication and User Management
- `useFirebaseAuth.ts` - Firebase authentication hook
  - User session management
  - Authentication state tracking
  - Login/logout handling
  - Token refresh management

#### UI and Interaction
- `use-toast.ts` - Toast notification system
  - Customizable notifications
  - Queue management
  - Animation handling
- `use-media-query.ts` - Responsive design hook
  - Screen size detection
  - Breakpoint management
- `useNotifications.ts` - System notifications
  - Browser notification permissions
  - Push notification handling
  - Custom notification styling

#### File Management
- `use-file-upload.ts` - File upload functionality
  - Multi-file upload support
  - Progress tracking
  - Error handling
  - File type validation
  - Size limit enforcement

### `/providers` (Context Providers)

#### Authentication
- `AuthProvider.tsx` - Authentication context provider
  - Combines NextAuth and Firebase authentication
  - Wraps SessionProvider from next-auth/react
  - Integrates custom Firebase auth hook
  - Manages global authentication state
  - Provides session information to components
  - Handles auth state synchronization

#### Theme Provider
- `theme-provider.tsx` (in components)
  - Dark/light mode management
  - Theme persistence
  - System preference detection
  - Dynamic theme switching

### `/prisma`
Database schema and migrations

### `/public`
Static assets and files

### `/types` (TypeScript Definitions)

#### Core Types
- `Message` interface
  - Basic message structure
  - HTML content support
  - Sender identification
  - Timestamp tracking
  - Mention system
  - Reaction support
  - Attachment handling
  - Email thread integration

- `Conversation` interface
  - Thread management
  - Recipient tracking
  - Message history
  - Unread count
  - Typing indicators
  - Notification preferences
  - Email thread status

- `Recipient` interface
  - User identification
  - Profile information
  - Avatar support
  - Bio and title fields

#### Email Integration Types
- `Email` interface
  - Message and thread IDs
  - Sender/receiver information
  - Content formats (text/HTML)
  - Read status
  - Label management
  - Attachment handling

- `EmailThread` interface
  - Thread organization
  - Message grouping
  - Participant tracking
  - Unread management
  - Subject handling

#### Interaction Types
- `ReactionType` type
  - Predefined reaction options
  - Emoji mappings
  - Interaction tracking

- `Reaction` interface
  - Type classification
  - Sender tracking
  - Timestamp recording

#### File Handling
- `Attachment` interface
  - URL management
  - File metadata
  - MIME type support
  - Upload status tracking
  - Attachment ID system

#### Authentication Types
- `next-auth.d.ts`
  - Session extensions
  - User profile augmentation
  - Token management
  - Authentication flow types

### Type System Architecture

#### Core Principles
- Strict type safety
- Null safety handling
- Optional property patterns
- Union type utilization
- Interface segregation
- Type composition

#### Integration Patterns
- NextAuth type extensions
- Firebase type integration
- API response typing
- State management types
- Event handler types

#### Type Utilities
- Type guards
- Type intersections
- Generic constraints
- Mapped types
- Conditional types

### `/styles`
Additional styling files

### `/functions`
Firebase Cloud Functions

### `/evals`
Evaluation and testing files

### `/data`
Data files and resources

### `/config`
Additional configuration files

## Build and Deploy

### GitHub Actions
Located in `.github/workflows/`
- `firebase-hosting-merge.yml` - Deployment workflow for merged changes
- `firebase-hosting-pull-request.yml` - Preview deployment for pull requests

## Notes
- `node_modules/` and `.next/` directories are excluded as they contain build and dependency files
- `out/` directory contains build output

## Technical Implementation Details

### Email Synchronization
- Real-time synchronization using Firebase listeners
- Optimized queries with composite indexes
- Fallback query support for missing indexes
- Duplicate message prevention
- Thread-based conversation organization
- Attachment handling and storage
- Push notification integration

### Authentication Flow
- OAuth 2.0 implementation
- Token management and refresh
- Session persistence
- Secure route protection
- Role-based access control

### Real-time Features
- WebSocket connections for instant updates
- Firebase real-time database integration
- Optimistic UI updates
- Offline support with data persistence
- Conflict resolution strategies

### Performance Considerations
- Lazy loading of conversations
- Virtualized message lists
- Optimized image loading
- Efficient data caching
- Background data synchronization
- Query optimization with indexes

### Security Implementation
- End-to-end encryption for messages
- Secure file upload handling
- Token-based authentication
- Rate limiting
- Input sanitization
- XSS prevention

### State Management Architecture

#### Context Providers
- Hierarchical provider structure
- Centralized state management
- Cross-cutting concerns separation
- Performance optimized context splitting
- Proper provider composition

#### Authentication State
- Dual authentication system (NextAuth + Firebase)
- Session management
- Token refresh handling
- Auth state persistence
- Cross-tab synchronization

#### Theme State
- User preference management
- System theme integration
- Local storage persistence
- Real-time theme updates
- CSS variable management 