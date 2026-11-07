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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      comments: {
        Row: {
          content: string
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_achievements: {
        Row: { id: string; crew_id: string; achievement_key: string; awarded_at: string }
        Insert: { id?: string; crew_id: string; achievement_key: string; awarded_at?: string }
        Update: { id?: string; crew_id?: string; achievement_key?: string; awarded_at?: string }
        Relationships: []
      }
      crew_members: {
        Row: {
          crew_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          crew_id: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          crew_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_members_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crews: {
        Row: {
          created_at: string
          description: string | null
          emblem: string
          id: string
          invite_code: string
          logo_url: string | null
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          emblem?: string
          id?: string
          invite_code?: string
          logo_url?: string | null
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          emblem?: string
          id?: string
          invite_code?: string
          logo_url?: string | null
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crews_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friend_requests: {
        Row: { id: string; requester_id: string; recipient_id: string; status: string; created_at: string; responded_at: string | null }
        Insert: { id?: string; requester_id: string; recipient_id: string; status?: string; created_at?: string; responded_at?: string | null }
        Update: { id?: string; requester_id?: string; recipient_id?: string; status?: string; created_at?: string; responded_at?: string | null }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lifts: {
        Row: {
          created_at: string
          description: string | null
          exercise: Database["public"]["Enums"]["exercise"]
          id: string
          lifted_on: string
          reps: number
          status: Database["public"]["Enums"]["lift_status"]
          verification_reason: string | null
          xp_awarded_at: string | null
          updated_at: string
          user_id: string
          verified_at: string | null
          video_path: string | null
          weight_kg: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          exercise: Database["public"]["Enums"]["exercise"]
          id?: string
          lifted_on?: string
          reps: number
          status?: Database["public"]["Enums"]["lift_status"]
          verification_reason?: string | null
          xp_awarded_at?: string | null
          updated_at?: string
          user_id: string
          verified_at?: string | null
          video_path?: string | null
          weight_kg: number
        }
        Update: {
          created_at?: string
          description?: string | null
          exercise?: Database["public"]["Enums"]["exercise"]
          id?: string
          lifted_on?: string
          reps?: number
          status?: Database["public"]["Enums"]["lift_status"]
          verification_reason?: string | null
          xp_awarded_at?: string | null
          updated_at?: string
          user_id?: string
          verified_at?: string | null
          video_path?: string | null
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "lifts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lift_flags: {
        Row: {
          created_at: string
          crew_id: string
          flagger_id: string
          id: string
          lift_id: string
        }
        Insert: {
          created_at?: string
          crew_id: string
          flagger_id: string
          id?: string
          lift_id: string
        }
        Update: {
          created_at?: string
          crew_id?: string
          flagger_id?: string
          id?: string
          lift_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lift_flags_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lift_flags_flagger_id_fkey"
            columns: ["flagger_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lift_flags_lift_id_fkey"
            columns: ["lift_id"]
            isOneToOne: false
            referencedRelation: "lifts"
            referencedColumns: ["id"]
          },
        ]
      }
      likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          content: string | null
          created_at: string
          id: string
          lift_id: string | null
          media_path: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          lift_id?: string | null
          media_path?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          lift_id?: string | null
          media_path?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_lift_id_fkey"
            columns: ["lift_id"]
            isOneToOne: false
            referencedRelation: "lifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      leaderboard_lifts: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          exercise: Database["public"]["Enums"]["exercise"] | null
          lifted_on: string | null
          position: number | null
          reps: number | null
          user_id: string | null
          username: string | null
          weight_kg: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lifts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_totals: {
        Row: {
          avatar_url: string | null
          bench_kg: number | null
          deadlift_kg: number | null
          display_name: string | null
          position: number | null
          squat_kg: number | null
          total_kg: number | null
          user_id: string | null
          username: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lifts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      crew_invite_code: { Args: { _crew: string }; Returns: string }
      crew_preview: {
        Args: { _code: string }
        Returns: {
          description: string
          id: string
          member_count: number
          name: string
        }[]
      }
      attach_lift_video: {
        Args: { _lift_id: string; _video_path: string }
        Returns: Database["public"]["Tables"]["lifts"]["Row"]
      }
      flag_lift: {
        Args: { _lift_id: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_crew_member: {
        Args: { _crew: string; _user: string }
        Returns: boolean
      }
      join_crew: { Args: { _code: string }; Returns: string }
      leaderboard: {
        Args: {
          _crew?: string
          _exercise: Database["public"]["Enums"]["exercise"]
          _since?: string
        }
        Returns: {
          avatar_url: string
          display_name: string
          lift_id: string
          lifted_on: string
          reps: number
          status: Database["public"]["Enums"]["lift_status"]
          user_id: string
          username: string
          weight_kg: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      exercise: "bench" | "squat" | "deadlift" | "ohp" | "pullup"
      lift_status:
        | "PENDING"
        | "AI_ANALYZING"
        | "AI_CHECKED"
        | "NEEDS_REVIEW"
        | "NEEDS_PROOF"
        | "UNDER_REVIEW"
        | "VERIFIED"
        | "REJECTED"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "moderator", "user"],
      exercise: ["bench", "squat", "deadlift", "ohp", "pullup"],
      lift_status: [
        "PENDING",
        "AI_ANALYZING",
        "AI_CHECKED",
        "NEEDS_REVIEW",
        "VERIFIED",
        "REJECTED",
      ],
    },
  },
} as const
