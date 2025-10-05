// Supabase Database Types
// Generated from database schema

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          role: 'user' | 'admin'
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          role?: 'user' | 'admin'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          role?: 'user' | 'admin'
          created_at?: string
          updated_at?: string
        }
      }
      download_history: {
        Row: {
          id: string
          user_id: string
          url: string
          title: string | null
          format: string | null
          quality: string | null
          file_size: number | null
          duration: number | null
          thumbnail_url: string | null
          status: 'pending' | 'processing' | 'completed' | 'failed'
          error_message: string | null
          downloaded_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          url: string
          title?: string | null
          format?: string | null
          quality?: string | null
          file_size?: number | null
          duration?: number | null
          thumbnail_url?: string | null
          status?: 'pending' | 'processing' | 'completed' | 'failed'
          error_message?: string | null
          downloaded_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          url?: string
          title?: string | null
          format?: string | null
          quality?: string | null
          file_size?: number | null
          duration?: number | null
          thumbnail_url?: string | null
          status?: 'pending' | 'processing' | 'completed' | 'failed'
          error_message?: string | null
          downloaded_at?: string
          created_at?: string
        }
      }
      user_settings: {
        Row: {
          id: string
          user_id: string
          preferred_quality: string
          preferred_format: string
          auto_download: boolean
          theme: 'light' | 'dark' | 'system'
          language: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          preferred_quality?: string
          preferred_format?: string
          auto_download?: boolean
          theme?: 'light' | 'dark' | 'system'
          language?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          preferred_quality?: string
          preferred_format?: string
          auto_download?: boolean
          theme?: 'light' | 'dark' | 'system'
          language?: string
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      handle_new_user: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
      handle_updated_at: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
