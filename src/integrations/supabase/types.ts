export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      crypto_identities: {
        Row: {
          created_at: string
          id: string
          public_key: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          public_key: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          public_key?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      otp_codes: {
        Row: {
          attempts: number
          channel: string
          code_hash: string
          consumed: boolean
          created_at: string
          expires_at: string
          id: string
          identifier: string
        }
        Insert: {
          attempts?: number
          channel: string
          code_hash: string
          consumed?: boolean
          created_at?: string
          expires_at: string
          id?: string
          identifier: string
        }
        Update: {
          attempts?: number
          channel?: string
          code_hash?: string
          consumed?: boolean
          created_at?: string
          expires_at?: string
          id?: string
          identifier?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_path: string | null
          bio: string
          channel_color: string
          channel_initials: string
          channel_name: string
          created_at: string
          display_name: string
          id: string
          privacy_dont_count_views: boolean
          privacy_hide_progress: boolean
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          bio?: string
          channel_color?: string
          channel_initials?: string
          channel_name?: string
          created_at?: string
          display_name?: string
          id: string
          privacy_dont_count_views?: boolean
          privacy_hide_progress?: boolean
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          bio?: string
          channel_color?: string
          channel_initials?: string
          channel_name?: string
          created_at?: string
          display_name?: string
          id?: string
          privacy_dont_count_views?: boolean
          privacy_hide_progress?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      signaling: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          payload: Json
          receiver_id: string
          room_id: string
          sender_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          payload: Json
          receiver_id: string
          room_id: string
          sender_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          payload?: Json
          receiver_id?: string
          room_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          channel_name: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          channel_name: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          channel_name?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      video_likes: {
        Row: {
          created_at: string
          id: string
          user_id: string
          value: number
          video_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          value: number
          video_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          value?: number
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_likes_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      video_seeders: {
        Row: {
          created_at: string
          id: string
          last_seen: string
          user_id: string
          video_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen?: string
          user_id: string
          video_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_seen?: string
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_seeders_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          category: string
          channel_color: string
          channel_initials: string
          channel_name: string
          created_at: string
          description: string
          duration: string
          embed_provider: string | null
          embed_video_id: string | null
          external_url: string | null
          gradient: string
          id: string
          mime_type: string
          source_kind: string
          storage_path: string | null
          thumbnail_path: string | null
          thumbnail_url: string | null
          title: string
          uploaded_by: string | null
          video_url: string
          views: number
        }
        Insert: {
          category?: string
          channel_color?: string
          channel_initials?: string
          channel_name: string
          created_at?: string
          description?: string
          duration?: string
          embed_provider?: string | null
          embed_video_id?: string | null
          external_url?: string | null
          gradient?: string
          id?: string
          mime_type?: string
          source_kind?: string
          storage_path?: string | null
          thumbnail_path?: string | null
          thumbnail_url?: string | null
          title: string
          uploaded_by?: string | null
          video_url: string
          views?: number
        }
        Update: {
          category?: string
          channel_color?: string
          channel_initials?: string
          channel_name?: string
          created_at?: string
          description?: string
          duration?: string
          embed_provider?: string | null
          embed_video_id?: string | null
          external_url?: string | null
          gradient?: string
          id?: string
          mime_type?: string
          source_kind?: string
          storage_path?: string | null
          thumbnail_path?: string | null
          thumbnail_url?: string | null
          title?: string
          uploaded_by?: string | null
          video_url?: string
          views?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_admin: { Args: never; Returns: boolean }
      delete_expired_signals: { Args: never; Returns: undefined }
      get_active_seeder_count: { Args: { _video_id: string }; Returns: number }
      get_subscriber_count: { Args: { _channel_name: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_video_views: { Args: { _video_id: string }; Returns: undefined }
      prune_stale_seeders: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
