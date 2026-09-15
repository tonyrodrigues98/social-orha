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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_deletion_tombstones: {
        Row: {
          content_prepared_at: string | null
          request_id: string
          started_at: string
          storage_object_count: number
          user_id: string
        }
        Insert: {
          content_prepared_at?: string | null
          request_id: string
          started_at?: string
          storage_object_count?: number
          user_id: string
        }
        Update: {
          content_prepared_at?: string | null
          request_id?: string
          started_at?: string
          storage_object_count?: number
          user_id?: string
        }
        Relationships: []
      }
      account_export_artifacts: {
        Row: {
          bucket_id: string
          byte_size: number
          created_at: string
          expires_at: string
          id: string
          object_path: string
          request_id: string
          sha256: string
          user_id: string
        }
        Insert: {
          bucket_id?: string
          byte_size: number
          created_at?: string
          expires_at: string
          id?: string
          object_path: string
          request_id: string
          sha256: string
          user_id: string
        }
        Update: {
          bucket_id?: string
          byte_size?: number
          created_at?: string
          expires_at?: string
          id?: string
          object_path?: string
          request_id?: string
          sha256?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_export_artifacts_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "account_lifecycle_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_export_artifacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      account_lifecycle_requests: {
        Row: {
          cancelled_at: string | null
          completed_at: string | null
          execute_after: string
          id: string
          kind: Database["public"]["Enums"]["account_lifecycle_kind"]
          requested_at: string
          status: Database["public"]["Enums"]["account_lifecycle_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          completed_at?: string | null
          execute_after: string
          id?: string
          kind: Database["public"]["Enums"]["account_lifecycle_kind"]
          requested_at?: string
          status?: Database["public"]["Enums"]["account_lifecycle_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          completed_at?: string | null
          execute_after?: string
          id?: string
          kind?: Database["public"]["Enums"]["account_lifecycle_kind"]
          requested_at?: string
          status?: Database["public"]["Enums"]["account_lifecycle_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_lifecycle_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: number
          metadata: Json
          request_id: string | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: never
          metadata?: Json
          request_id?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: never
          metadata?: Json
          request_id?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
          reason: string | null
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      communities: {
        Row: {
          archived_at: string | null
          avatar_path: string | null
          category: string
          cover_path: string | null
          created_at: string
          description: string
          id: string
          name: string
          owner_id: string | null
          slug: string
          updated_at: string
          visibility: Database["public"]["Enums"]["community_visibility"]
        }
        Insert: {
          archived_at?: string | null
          avatar_path?: string | null
          category?: string
          cover_path?: string | null
          created_at?: string
          description?: string
          id?: string
          name: string
          owner_id?: string | null
          slug: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["community_visibility"]
        }
        Update: {
          archived_at?: string | null
          avatar_path?: string | null
          category?: string
          cover_path?: string | null
          created_at?: string
          description?: string
          id?: string
          name?: string
          owner_id?: string | null
          slug?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["community_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "communities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_branding_cleanup: {
        Row: {
          bucket_id: string
          id: string
          object_path: string
          owner_id: string | null
          requested_at: string
        }
        Insert: {
          bucket_id?: string
          id?: string
          object_path: string
          owner_id?: string | null
          requested_at?: string
        }
        Update: {
          bucket_id?: string
          id?: string
          object_path?: string
          owner_id?: string | null
          requested_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_branding_cleanup_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_branding_media: {
        Row: {
          bucket_id: string
          byte_size: number
          community_id: string
          created_at: string
          height: number
          id: string
          mime_type: string
          object_path: string
          owner_id: string
          purpose: string
          status: Database["public"]["Enums"]["media_processing_status"]
          updated_at: string
          width: number
        }
        Insert: {
          bucket_id?: string
          byte_size: number
          community_id: string
          created_at?: string
          height: number
          id?: string
          mime_type: string
          object_path: string
          owner_id: string
          purpose: string
          status?: Database["public"]["Enums"]["media_processing_status"]
          updated_at?: string
          width: number
        }
        Update: {
          bucket_id?: string
          byte_size?: number
          community_id?: string
          created_at?: string
          height?: number
          id?: string
          mime_type?: string
          object_path?: string
          owner_id?: string
          purpose?: string
          status?: Database["public"]["Enums"]["media_processing_status"]
          updated_at?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "community_branding_media_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_branding_media_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_memberships: {
        Row: {
          community_id: string
          created_at: string
          joined_at: string | null
          profile_id: string
          role: Database["public"]["Enums"]["community_role"]
          status: Database["public"]["Enums"]["community_membership_status"]
          updated_at: string
        }
        Insert: {
          community_id: string
          created_at?: string
          joined_at?: string | null
          profile_id: string
          role?: Database["public"]["Enums"]["community_role"]
          status?: Database["public"]["Enums"]["community_membership_status"]
          updated_at?: string
        }
        Update: {
          community_id?: string
          created_at?: string
          joined_at?: string | null
          profile_id?: string
          role?: Database["public"]["Enums"]["community_role"]
          status?: Database["public"]["Enums"]["community_membership_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_memberships_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          author_id: string | null
          body: string
          community_id: string | null
          created_at: string
          id: string
          status: Database["public"]["Enums"]["content_status"]
          updated_at: string
          visibility: Database["public"]["Enums"]["content_visibility"]
        }
        Insert: {
          author_id?: string | null
          body: string
          community_id?: string | null
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["content_status"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["content_visibility"]
        }
        Update: {
          author_id?: string | null
          body?: string
          community_id?: string | null
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["content_status"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["content_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_rules: {
        Row: {
          community_id: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          community_id: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          community_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_rules_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          conversation_id: string
          created_at: string
          joined_at: string | null
          profile_id: string
          role: Database["public"]["Enums"]["conversation_member_role"]
          status: Database["public"]["Enums"]["conversation_member_status"]
          updated_at: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          joined_at?: string | null
          profile_id: string
          role?: Database["public"]["Enums"]["conversation_member_role"]
          status?: Database["public"]["Enums"]["conversation_member_status"]
          updated_at?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          joined_at?: string | null
          profile_id?: string
          role?: Database["public"]["Enums"]["conversation_member_role"]
          status?: Database["public"]["Enums"]["conversation_member_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_preferences: {
        Row: {
          archived_at: string | null
          cleared_before: string | null
          conversation_id: string
          created_at: string
          favorited_at: string | null
          muted_until: string | null
          notifications_enabled: boolean
          profile_id: string
          read_receipts_enabled: boolean
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          cleared_before?: string | null
          conversation_id: string
          created_at?: string
          favorited_at?: string | null
          muted_until?: string | null
          notifications_enabled?: boolean
          profile_id: string
          read_receipts_enabled?: boolean
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          cleared_before?: string | null
          conversation_id?: string
          created_at?: string
          favorited_at?: string | null
          muted_until?: string | null
          notifications_enabled?: boolean
          profile_id?: string
          read_receipts_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_preferences_conversation_id_profile_id_fkey"
            columns: ["conversation_id", "profile_id"]
            isOneToOne: true
            referencedRelation: "conversation_members"
            referencedColumns: ["conversation_id", "profile_id"]
          },
        ]
      }
      conversation_requests: {
        Row: {
          conversation_id: string | null
          created_at: string
          id: string
          opening_message: string | null
          recipient_id: string
          requester_id: string
          responded_at: string | null
          status: Database["public"]["Enums"]["conversation_request_status"]
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          opening_message?: string | null
          recipient_id: string
          requester_id: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["conversation_request_status"]
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          opening_message?: string | null
          recipient_id?: string
          requester_id?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["conversation_request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "conversation_requests_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_requests_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          direct_user_high: string | null
          direct_user_low: string | null
          id: string
          kind: Database["public"]["Enums"]["conversation_kind"]
          title: string | null
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          direct_user_high?: string | null
          direct_user_low?: string | null
          id?: string
          kind: Database["public"]["Enums"]["conversation_kind"]
          title?: string | null
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          direct_user_high?: string | null
          direct_user_low?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["conversation_kind"]
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_direct_user_high_fkey"
            columns: ["direct_user_high"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_direct_user_low_fkey"
            columns: ["direct_user_low"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          accepted_at: string | null
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: Database["public"]["Enums"]["friendship_status"]
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: Database["public"]["Enums"]["friendship_status"]
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: Database["public"]["Enums"]["friendship_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachments: {
        Row: {
          bucket_id: string
          byte_size: number
          cleanup_requested_at: string | null
          created_at: string
          duration_seconds: number | null
          forwarded_from_attachment_id: string | null
          height: number | null
          id: string
          message_id: string
          mime_type: string
          object_path: string
          owner_id: string
          removed_at: string | null
          waveform: Json | null
          width: number | null
        }
        Insert: {
          bucket_id?: string
          byte_size: number
          cleanup_requested_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          forwarded_from_attachment_id?: string | null
          height?: number | null
          id?: string
          message_id: string
          mime_type: string
          object_path: string
          owner_id: string
          removed_at?: string | null
          waveform?: Json | null
          width?: number | null
        }
        Update: {
          bucket_id?: string
          byte_size?: number
          cleanup_requested_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          forwarded_from_attachment_id?: string | null
          height?: number | null
          id?: string
          message_id?: string
          mime_type?: string
          object_path?: string
          owner_id?: string
          removed_at?: string | null
          waveform?: Json | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_forwarded_from_attachment_id_fkey"
            columns: ["forwarded_from_attachment_id"]
            isOneToOne: false
            referencedRelation: "message_attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_attachments_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          kind: Database["public"]["Enums"]["reaction_kind"]
          message_id: string
          reactor_id: string
        }
        Insert: {
          created_at?: string
          kind: Database["public"]["Enums"]["reaction_kind"]
          message_id: string
          reactor_id: string
        }
        Update: {
          created_at?: string
          kind?: Database["public"]["Enums"]["reaction_kind"]
          message_id?: string
          reactor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_reactor_id_fkey"
            columns: ["reactor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_receipts: {
        Row: {
          delivered_at: string | null
          message_id: string
          profile_id: string
          read_at: string | null
        }
        Insert: {
          delivered_at?: string | null
          message_id: string
          profile_id: string
          read_at?: string | null
        }
        Update: {
          delivered_at?: string | null
          message_id?: string
          profile_id?: string
          read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_receipts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_receipts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          client_message_id: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          forwarded_from_message_id: string | null
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          reply_to_message_id: string | null
          sender_id: string | null
        }
        Insert: {
          body?: string | null
          client_message_id?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          forwarded_from_message_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          reply_to_message_id?: string | null
          sender_id?: string | null
        }
        Update: {
          body?: string | null
          client_message_id?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          forwarded_from_message_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          reply_to_message_id?: string | null
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_forwarded_from_message_id_fkey"
            columns: ["forwarded_from_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_cases: {
        Row: {
          assigned_to: string | null
          id: string
          opened_at: string
          priority: number
          report_id: string
          resolution: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["report_status"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          id?: string
          opened_at?: string
          priority?: number
          report_id: string
          resolution?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          id?: string
          opened_at?: string
          priority?: number
          report_id?: string
          resolution?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_cases_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_cases_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: true
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          community_enabled: boolean
          created_at: string
          email_enabled: boolean
          messages_enabled: boolean
          profile_id: string
          push_enabled: boolean
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          social_enabled: boolean
          system_enabled: boolean
          updated_at: string
        }
        Insert: {
          community_enabled?: boolean
          created_at?: string
          email_enabled?: boolean
          messages_enabled?: boolean
          profile_id: string
          push_enabled?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          social_enabled?: boolean
          system_enabled?: boolean
          updated_at?: string
        }
        Update: {
          community_enabled?: boolean
          created_at?: string
          email_enabled?: boolean
          messages_enabled?: boolean
          profile_id?: string
          push_enabled?: boolean
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          social_enabled?: boolean
          system_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          community_id: string | null
          created_at: string
          dedupe_key: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          payload: Json
          post_id: string | null
          read_at: string | null
          recipient_id: string
          type: string
        }
        Insert: {
          actor_id?: string | null
          community_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          payload?: Json
          post_id?: string | null
          read_at?: string | null
          recipient_id: string
          type: string
        }
        Update: {
          actor_id?: string | null
          community_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          payload?: Json
          post_id?: string | null
          read_at?: string | null
          recipient_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orphan_media_cleanup_claims: {
        Row: {
          bucket_id: string
          claimed_at: string
          object_path: string
        }
        Insert: {
          bucket_id: string
          claimed_at?: string
          object_path: string
        }
        Update: {
          bucket_id?: string
          claimed_at?: string
          object_path?: string
        }
        Relationships: []
      }
      post_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          parent_comment_id: string | null
          post_id: string
          status: Database["public"]["Enums"]["content_status"]
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          post_id: string
          status?: Database["public"]["Enums"]["content_status"]
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          post_id?: string
          status?: Database["public"]["Enums"]["content_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_media: {
        Row: {
          bucket_id: string
          byte_size: number
          created_at: string
          height: number | null
          id: string
          mime_type: string
          object_path: string
          owner_id: string
          post_id: string
          sort_order: number
          status: Database["public"]["Enums"]["media_processing_status"]
          updated_at: string
          width: number | null
        }
        Insert: {
          bucket_id?: string
          byte_size: number
          created_at?: string
          height?: number | null
          id?: string
          mime_type: string
          object_path: string
          owner_id: string
          post_id: string
          sort_order?: number
          status?: Database["public"]["Enums"]["media_processing_status"]
          updated_at?: string
          width?: number | null
        }
        Update: {
          bucket_id?: string
          byte_size?: number
          created_at?: string
          height?: number | null
          id?: string
          mime_type?: string
          object_path?: string
          owner_id?: string
          post_id?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["media_processing_status"]
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "post_media_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_media_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reactions: {
        Row: {
          comment_id: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["reaction_kind"]
          post_id: string | null
          reactor_id: string
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["reaction_kind"]
          post_id?: string | null
          reactor_id: string
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["reaction_kind"]
          post_id?: string | null
          reactor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reactions_reactor_id_fkey"
            columns: ["reactor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_details: {
        Row: {
          created_at: string
          desired_places: string[]
          favorite_artists: Json
          favorite_books: Json
          favorite_games: Json
          favorite_movies: Json
          favorite_season: string | null
          favorite_series: Json
          favorite_songs: Json
          hobbies: string[]
          interests: string[]
          personality: string[]
          profile_id: string
          social_energy: string | null
          updated_at: string
          visited_places: string[]
          weekend_preferences: string[]
        }
        Insert: {
          created_at?: string
          desired_places?: string[]
          favorite_artists?: Json
          favorite_books?: Json
          favorite_games?: Json
          favorite_movies?: Json
          favorite_season?: string | null
          favorite_series?: Json
          favorite_songs?: Json
          hobbies?: string[]
          interests?: string[]
          personality?: string[]
          profile_id: string
          social_energy?: string | null
          updated_at?: string
          visited_places?: string[]
          weekend_preferences?: string[]
        }
        Update: {
          created_at?: string
          desired_places?: string[]
          favorite_artists?: Json
          favorite_books?: Json
          favorite_games?: Json
          favorite_movies?: Json
          favorite_season?: string | null
          favorite_series?: Json
          favorite_songs?: Json
          hobbies?: string[]
          interests?: string[]
          personality?: string[]
          profile_id?: string
          social_energy?: string | null
          updated_at?: string
          visited_places?: string[]
          weekend_preferences?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "profile_details_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_media: {
        Row: {
          bucket_id: string
          byte_size: number
          created_at: string
          height: number
          id: string
          mime_type: string
          object_path: string
          profile_id: string
          purpose: Database["public"]["Enums"]["profile_media_purpose"]
          sort_order: number
          status: Database["public"]["Enums"]["media_processing_status"]
          updated_at: string
          width: number
        }
        Insert: {
          bucket_id?: string
          byte_size: number
          created_at?: string
          height: number
          id?: string
          mime_type: string
          object_path: string
          profile_id: string
          purpose: Database["public"]["Enums"]["profile_media_purpose"]
          sort_order?: number
          status?: Database["public"]["Enums"]["media_processing_status"]
          updated_at?: string
          width: number
        }
        Update: {
          bucket_id?: string
          byte_size?: number
          created_at?: string
          height?: number
          id?: string
          mime_type?: string
          object_path?: string
          profile_id?: string
          purpose?: Database["public"]["Enums"]["profile_media_purpose"]
          sort_order?: number
          status?: Database["public"]["Enums"]["media_processing_status"]
          updated_at?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "profile_media_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_moderation_state: {
        Row: {
          created_at: string
          profile_id: string
          public_reason: string | null
          restricted_until: string | null
          status: Database["public"]["Enums"]["profile_account_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          profile_id: string
          public_reason?: string | null
          restricted_until?: string | null
          status?: Database["public"]["Enums"]["profile_account_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          profile_id?: string
          public_reason?: string | null
          restricted_until?: string | null
          status?: Database["public"]["Enums"]["profile_account_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_moderation_state_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_privacy: {
        Row: {
          age_visibility: Database["public"]["Enums"]["profile_visibility"]
          created_at: string
          dating_enabled: boolean
          favorites_visibility: Database["public"]["Enums"]["profile_visibility"]
          gallery_visibility: Database["public"]["Enums"]["profile_visibility"]
          location_visibility: Database["public"]["Enums"]["profile_visibility"]
          profile_id: string
          profile_visibility: Database["public"]["Enums"]["profile_visibility"]
          updated_at: string
        }
        Insert: {
          age_visibility?: Database["public"]["Enums"]["profile_visibility"]
          created_at?: string
          dating_enabled?: boolean
          favorites_visibility?: Database["public"]["Enums"]["profile_visibility"]
          gallery_visibility?: Database["public"]["Enums"]["profile_visibility"]
          location_visibility?: Database["public"]["Enums"]["profile_visibility"]
          profile_id: string
          profile_visibility?: Database["public"]["Enums"]["profile_visibility"]
          updated_at?: string
        }
        Update: {
          age_visibility?: Database["public"]["Enums"]["profile_visibility"]
          created_at?: string
          dating_enabled?: boolean
          favorites_visibility?: Database["public"]["Enums"]["profile_visibility"]
          gallery_visibility?: Database["public"]["Enums"]["profile_visibility"]
          location_visibility?: Database["public"]["Enums"]["profile_visibility"]
          profile_id?: string
          profile_visibility?: Database["public"]["Enums"]["profile_visibility"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_privacy_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          bio: string | null
          birth_date: string | null
          church: string | null
          city: string | null
          created_at: string
          full_name: string | null
          id: string
          onboarding_completed_at: string | null
          onboarding_step: number
          state_code: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_path?: string | null
          bio?: string | null
          birth_date?: string | null
          church?: string | null
          city?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          onboarding_completed_at?: string | null
          onboarding_step?: number
          state_code?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_path?: string | null
          bio?: string | null
          birth_date?: string | null
          church?: string | null
          city?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          onboarding_completed_at?: string | null
          onboarding_step?: number
          state_code?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      report_evidence: {
        Row: {
          bucket_id: string
          byte_size: number
          created_at: string
          id: string
          mime_type: string
          object_path: string
          report_id: string
          retention_until: string
          status: Database["public"]["Enums"]["media_processing_status"]
          uploader_id: string | null
        }
        Insert: {
          bucket_id?: string
          byte_size: number
          created_at?: string
          id?: string
          mime_type: string
          object_path: string
          report_id: string
          retention_until?: string
          status?: Database["public"]["Enums"]["media_processing_status"]
          uploader_id?: string | null
        }
        Update: {
          bucket_id?: string
          byte_size?: number
          created_at?: string
          id?: string
          mime_type?: string
          object_path?: string
          report_id?: string
          retention_until?: string
          status?: Database["public"]["Enums"]["media_processing_status"]
          uploader_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_evidence_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_evidence_uploader_id_fkey"
            columns: ["uploader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      report_target_attachments: {
        Row: {
          bucket_id: string
          byte_size: number
          created_at: string
          duration_seconds: number | null
          height: number | null
          id: string
          mime_type: string
          object_path: string
          report_id: string
          retention_until: string
          source_id: string
          source_kind: string
          target_owner_id: string | null
          waveform: Json | null
          width: number | null
        }
        Insert: {
          bucket_id: string
          byte_size: number
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          mime_type: string
          object_path: string
          report_id: string
          retention_until?: string
          source_id: string
          source_kind: string
          target_owner_id?: string | null
          waveform?: Json | null
          width?: number | null
        }
        Update: {
          bucket_id?: string
          byte_size?: number
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          mime_type?: string
          object_path?: string
          report_id?: string
          retention_until?: string
          source_id?: string
          source_kind?: string
          target_owner_id?: string | null
          waveform?: Json | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "report_target_attachments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_target_attachments_target_owner_id_fkey"
            columns: ["target_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          assigned_to: string | null
          category: string
          created_at: string
          details: string | null
          id: string
          reporter_id: string | null
          resolution: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_owner_id: string | null
          target_snapshot: Json
          target_type: Database["public"]["Enums"]["report_target_type"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category: string
          created_at?: string
          details?: string | null
          id?: string
          reporter_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_owner_id?: string | null
          target_snapshot: Json
          target_type: Database["public"]["Enums"]["report_target_type"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          created_at?: string
          details?: string | null
          id?: string
          reporter_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id?: string
          target_owner_id?: string | null
          target_snapshot?: Json
          target_type?: Database["public"]["Enums"]["report_target_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_target_owner_id_fkey"
            columns: ["target_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sanctions: {
        Row: {
          action_type: Database["public"]["Enums"]["moderation_action_type"]
          case_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          imposed_by: string | null
          metadata: Json
          reason: string
          revoked_at: string | null
          revoked_by: string | null
          revoked_reason: string | null
          starts_at: string
          target_id: string
          target_type: Database["public"]["Enums"]["report_target_type"]
        }
        Insert: {
          action_type: Database["public"]["Enums"]["moderation_action_type"]
          case_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          imposed_by?: string | null
          metadata?: Json
          reason: string
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          starts_at?: string
          target_id: string
          target_type: Database["public"]["Enums"]["report_target_type"]
        }
        Update: {
          action_type?: Database["public"]["Enums"]["moderation_action_type"]
          case_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          imposed_by?: string | null
          metadata?: Json
          reason?: string
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          starts_at?: string
          target_id?: string
          target_type?: Database["public"]["Enums"]["report_target_type"]
        }
        Relationships: [
          {
            foreignKeyName: "sanctions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "moderation_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sanctions_imposed_by_fkey"
            columns: ["imposed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sanctions_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          sender_id: string
          ticket_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          sender_id: string
          ticket_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          sender_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: Database["public"]["Enums"]["support_ticket_category"]
          created_at: string
          id: string
          last_message_at: string
          priority: Database["public"]["Enums"]["support_ticket_priority"]
          requester_id: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category: Database["public"]["Enums"]["support_ticket_category"]
          created_at?: string
          id?: string
          last_message_at?: string
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          requester_id: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["support_ticket_category"]
          created_at?: string
          id?: string
          last_message_at?: string
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          requester_id?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          analytics_consent_updated_at: string | null
          analytics_enabled: boolean
          created_at: string
          high_contrast: boolean
          locale: string
          profile_id: string
          reduced_motion: boolean
          timezone_name: string
          updated_at: string
        }
        Insert: {
          analytics_consent_updated_at?: string | null
          analytics_enabled?: boolean
          created_at?: string
          high_contrast?: boolean
          locale?: string
          profile_id: string
          reduced_motion?: boolean
          timezone_name?: string
          updated_at?: string
        }
        Update: {
          analytics_consent_updated_at?: string | null
          analytics_enabled?: boolean
          created_at?: string
          high_contrast?: boolean
          locale?: string
          profile_id?: string
          reduced_motion?: boolean
          timezone_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_moderation_action: {
        Args: {
          p_action_type: Database["public"]["Enums"]["moderation_action_type"]
          p_expires_at?: string
          p_reason: string
          p_report_id: string
        }
        Returns: {
          action_type: Database["public"]["Enums"]["moderation_action_type"]
          case_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          imposed_by: string | null
          metadata: Json
          reason: string
          revoked_at: string | null
          revoked_by: string | null
          revoked_reason: string | null
          starts_at: string
          target_id: string
          target_type: Database["public"]["Enums"]["report_target_type"]
        }
        SetofOptions: {
          from: "*"
          to: "sanctions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      archive_community: {
        Args: { p_community_id: string }
        Returns: {
          archived_at: string | null
          avatar_path: string | null
          category: string
          cover_path: string | null
          created_at: string
          description: string
          id: string
          name: string
          owner_id: string | null
          slug: string
          updated_at: string
          visibility: Database["public"]["Enums"]["community_visibility"]
        }
        SetofOptions: {
          from: "*"
          to: "communities"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assign_global_role: {
        Args: {
          p_reason: string
          p_role: Database["public"]["Enums"]["app_role"]
          p_target_user_id: string
        }
        Returns: {
          full_name: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
          username: string
        }[]
      }
      ban_community_member: {
        Args: {
          p_community_id: string
          p_profile_id: string
          p_reason?: string
        }
        Returns: {
          community_id: string
          created_at: string
          joined_at: string | null
          profile_id: string
          role: Database["public"]["Enums"]["community_role"]
          status: Database["public"]["Enums"]["community_membership_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "community_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      block_profile: {
        Args: { p_reason?: string; p_target_profile_id: string }
        Returns: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
          reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "blocks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_account_lifecycle: {
        Args: { p_request_id: string }
        Returns: {
          cancelled_at: string | null
          completed_at: string | null
          execute_after: string
          id: string
          kind: Database["public"]["Enums"]["account_lifecycle_kind"]
          requested_at: string
          status: Database["public"]["Enums"]["account_lifecycle_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "account_lifecycle_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_account_lifecycle_request: {
        Args: {
          p_kind: Database["public"]["Enums"]["account_lifecycle_kind"]
          p_request_id?: string
          p_user_id?: string
        }
        Returns: {
          cancelled_at: string | null
          completed_at: string | null
          execute_after: string
          id: string
          kind: Database["public"]["Enums"]["account_lifecycle_kind"]
          requested_at: string
          status: Database["public"]["Enums"]["account_lifecycle_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "account_lifecycle_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_moderation_case: {
        Args: { p_case_id: string }
        Returns: {
          assigned_to: string | null
          id: string
          opened_at: string
          priority: number
          report_id: string
          resolution: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["report_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "moderation_cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_orphan_media_upload_cleanup: {
        Args: { p_bucket_id: string; p_object_path: string }
        Returns: boolean
      }
      claim_support_ticket: {
        Args: { p_ticket_id: string }
        Returns: {
          assigned_to: string | null
          category: Database["public"]["Enums"]["support_ticket_category"]
          created_at: string
          id: string
          last_message_at: string
          priority: Database["public"]["Enums"]["support_ticket_priority"]
          requester_id: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "support_tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cleanup_actor_rate_limit_windows: {
        Args: { p_limit?: number }
        Returns: number
      }
      clear_conversation_for_me: {
        Args: { p_conversation_id: string }
        Returns: {
          archived_at: string | null
          cleared_before: string | null
          conversation_id: string
          created_at: string
          favorited_at: string | null
          muted_until: string | null
          notifications_enabled: boolean
          profile_id: string
          read_receipts_enabled: boolean
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "conversation_preferences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      close_group_conversation: {
        Args: { p_conversation_id: string }
        Returns: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          direct_user_high: string | null
          direct_user_low: string | null
          id: string
          kind: Database["public"]["Enums"]["conversation_kind"]
          title: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "conversations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_account_export_cleanup: {
        Args: { p_artifact_id: string }
        Returns: undefined
      }
      complete_account_lifecycle_request: {
        Args: { p_metadata?: Json; p_request_id: string }
        Returns: {
          cancelled_at: string | null
          completed_at: string | null
          execute_after: string
          id: string
          kind: Database["public"]["Enums"]["account_lifecycle_kind"]
          requested_at: string
          status: Database["public"]["Enums"]["account_lifecycle_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "account_lifecycle_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_community_branding_cleanup: {
        Args: { p_cleanup_id: string; p_cleanup_kind: string }
        Returns: undefined
      }
      complete_message_attachment_cleanup: {
        Args: { p_attachment_id: string }
        Returns: undefined
      }
      complete_orphan_media_upload_cleanup: {
        Args: { p_bucket_id: string; p_object_path: string }
        Returns: undefined
      }
      complete_own_onboarding: {
        Args: never
        Returns: {
          avatar_path: string | null
          bio: string | null
          birth_date: string | null
          church: string | null
          city: string | null
          created_at: string
          full_name: string | null
          id: string
          onboarding_completed_at: string | null
          onboarding_step: number
          state_code: string | null
          updated_at: string
          username: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_post_media_cleanup: {
        Args: { p_media_id: string }
        Returns: undefined
      }
      complete_profile_media_cleanup: {
        Args: { p_media_id: string }
        Returns: undefined
      }
      complete_report_evidence_cleanup: {
        Args: { p_evidence_id: string }
        Returns: undefined
      }
      complete_report_target_attachment_cleanup: {
        Args: { p_attachment_id: string }
        Returns: undefined
      }
      create_account_export_artifact: {
        Args: {
          p_byte_size: number
          p_expires_at: string
          p_object_path: string
          p_request_id: string
          p_sha256: string
          p_user_id: string
        }
        Returns: {
          bucket_id: string
          byte_size: number
          created_at: string
          expires_at: string
          id: string
          object_path: string
          request_id: string
          sha256: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "account_export_artifacts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_community: {
        Args: {
          p_category?: string
          p_description?: string
          p_name: string
          p_slug: string
          p_visibility?: Database["public"]["Enums"]["community_visibility"]
        }
        Returns: {
          archived_at: string | null
          avatar_path: string | null
          category: string
          cover_path: string | null
          created_at: string
          description: string
          id: string
          name: string
          owner_id: string | null
          slug: string
          updated_at: string
          visibility: Database["public"]["Enums"]["community_visibility"]
        }
        SetofOptions: {
          from: "*"
          to: "communities"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_group_conversation: {
        Args: { p_member_ids: string[]; p_title: string }
        Returns: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          direct_user_high: string | null
          direct_user_low: string | null
          id: string
          kind: Database["public"]["Enums"]["conversation_kind"]
          title: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "conversations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_report: {
        Args: {
          p_category: string
          p_details?: string
          p_target_id: string
          p_target_type: Database["public"]["Enums"]["report_target_type"]
        }
        Returns: {
          assigned_to: string
          category: string
          created_at: string
          details: string
          id: string
          reporter_id: string
          resolution: string
          resolved_at: string
          status: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_type: Database["public"]["Enums"]["report_target_type"]
          updated_at: string
        }[]
      }
      create_support_ticket: {
        Args: {
          p_category: Database["public"]["Enums"]["support_ticket_category"]
          p_message: string
          p_subject: string
        }
        Returns: {
          assigned_to: string | null
          category: Database["public"]["Enums"]["support_ticket_category"]
          created_at: string
          id: string
          last_message_at: string
          priority: Database["public"]["Enums"]["support_ticket_priority"]
          requester_id: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "support_tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_community_rule: {
        Args: { p_rule_id: string }
        Returns: {
          community_id: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          sort_order: number
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "community_rules"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_message: {
        Args: { p_message_id: string }
        Returns: {
          body: string | null
          client_message_id: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          forwarded_from_message_id: string | null
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          reply_to_message_id: string | null
          sender_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      edit_message: {
        Args: { p_body: string; p_message_id: string }
        Returns: {
          body: string | null
          client_message_id: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          forwarded_from_message_id: string | null
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          reply_to_message_id: string | null
          sender_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fail_account_lifecycle_request: {
        Args: { p_error_code: string; p_request_id: string }
        Returns: {
          cancelled_at: string | null
          completed_at: string | null
          execute_after: string
          id: string
          kind: Database["public"]["Enums"]["account_lifecycle_kind"]
          requested_at: string
          status: Database["public"]["Enums"]["account_lifecycle_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "account_lifecycle_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      favorite_payload_is_valid: {
        Args: {
          candidate: Json
          maximum_bytes: number
          maximum_item_bytes: number
          maximum_items: number
        }
        Returns: boolean
      }
      finalize_post_media: {
        Args: { p_media_id: string }
        Returns: {
          bucket_id: string
          byte_size: number
          created_at: string
          height: number | null
          id: string
          mime_type: string
          object_path: string
          owner_id: string
          post_id: string
          sort_order: number
          status: Database["public"]["Enums"]["media_processing_status"]
          updated_at: string
          width: number | null
        }
        SetofOptions: {
          from: "*"
          to: "post_media"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finalize_profile_media: {
        Args: { p_media_id: string }
        Returns: {
          bucket_id: string
          byte_size: number
          created_at: string
          height: number
          id: string
          mime_type: string
          object_path: string
          profile_id: string
          purpose: Database["public"]["Enums"]["profile_media_purpose"]
          sort_order: number
          status: Database["public"]["Enums"]["media_processing_status"]
          updated_at: string
          width: number
        }
        SetofOptions: {
          from: "*"
          to: "profile_media"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finalize_validated_community_branding: {
        Args: { p_media_id: string; p_owner_id: string }
        Returns: {
          bucket_id: string
          byte_size: number
          community_id: string
          created_at: string
          height: number
          id: string
          mime_type: string
          object_path: string
          owner_id: string
          purpose: string
          status: Database["public"]["Enums"]["media_processing_status"]
          updated_at: string
          width: number
        }
        SetofOptions: {
          from: "*"
          to: "community_branding_media"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finalize_validated_post_media: {
        Args: { p_media_id: string; p_owner_id: string }
        Returns: {
          bucket_id: string
          byte_size: number
          created_at: string
          height: number | null
          id: string
          mime_type: string
          object_path: string
          owner_id: string
          post_id: string
          sort_order: number
          status: Database["public"]["Enums"]["media_processing_status"]
          updated_at: string
          width: number | null
        }
        SetofOptions: {
          from: "*"
          to: "post_media"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finalize_validated_profile_media: {
        Args: { p_media_id: string; p_profile_id: string }
        Returns: {
          bucket_id: string
          byte_size: number
          created_at: string
          height: number
          id: string
          mime_type: string
          object_path: string
          profile_id: string
          purpose: Database["public"]["Enums"]["profile_media_purpose"]
          sort_order: number
          status: Database["public"]["Enums"]["media_processing_status"]
          updated_at: string
          width: number
        }
        SetofOptions: {
          from: "*"
          to: "profile_media"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finalize_validated_report_evidence: {
        Args: { p_evidence_id: string; p_owner_id: string }
        Returns: {
          bucket_id: string
          byte_size: number
          created_at: string
          id: string
          mime_type: string
          object_path: string
          report_id: string
          retention_until: string
          status: Database["public"]["Enums"]["media_processing_status"]
          uploader_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "report_evidence"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      forward_message: {
        Args: {
          p_client_message_id?: string
          p_source_message_id: string
          p_target_conversation_id: string
        }
        Returns: {
          body: string | null
          client_message_id: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          forwarded_from_message_id: string | null
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          reply_to_message_id: string | null
          sender_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_community_discovery: {
        Args: { p_community_id: string }
        Returns: {
          active_member_count: number
          active_post_count: number
          avatar_path: string
          category: string
          community_id: string
          cover_path: string
          description: string
          name: string
          slug: string
          visibility: Database["public"]["Enums"]["community_visibility"]
        }[]
      }
      get_home_dashboard_summary: {
        Args: { p_recent_limit?: number }
        Returns: Json
      }
      get_messaging_profile_summaries: {
        Args: { p_profile_ids: string[] }
        Returns: {
          avatar_path: string
          full_name: string
          profile_id: string
          username: string
        }[]
      }
      get_moderation_report_attachment: {
        Args: { p_attachment_id: string; p_report_id: string }
        Returns: {
          attachment_id: string
          bucket_id: string
          byte_size: number
          duration_seconds: number
          height: number
          mime_type: string
          object_path: string
          source_kind: string
          waveform: Json
          width: number
        }[]
      }
      get_moderation_report_context: {
        Args: { p_report_id: string }
        Returns: {
          attachment_ids: string[]
          content_created_at: string
          content_kind: string
          content_text: string
          report_id: string
          target_id: string
          target_owner_id: string
          target_type: Database["public"]["Enums"]["report_target_type"]
        }[]
      }
      get_own_account_status: {
        Args: never
        Returns: {
          access_enabled: boolean
          effective_status: Database["public"]["Enums"]["profile_account_status"]
          recorded_status: Database["public"]["Enums"]["profile_account_status"]
          restricted_until: string
        }[]
      }
      get_own_blocked_profile_by_username: {
        Args: { p_username: string }
        Returns: {
          avatar_path: string
          block_id: string
          blocked_profile_id: string
          full_name: string
          username: string
        }[]
      }
      get_visible_community_post: {
        Args: { p_post_id: string }
        Returns: {
          author_avatar_path: string
          author_full_name: string
          author_id: string
          author_username: string
          body: string
          comment_count: number
          community_id: string
          created_at: string
          post_id: string
          reaction_count: number
          status: Database["public"]["Enums"]["content_status"]
          updated_at: string
          viewer_reaction: Database["public"]["Enums"]["reaction_kind"]
          visibility: Database["public"]["Enums"]["content_visibility"]
        }[]
      }
      get_visible_profile_age: {
        Args: { p_profile_id: string }
        Returns: {
          age_years: number
          can_view_age: boolean
          profile_id: string
        }[]
      }
      get_visible_profiles: {
        Args: {
          page_offset?: number
          page_size?: number
          target_profile_id?: string
        }
        Returns: {
          avatar_path: string
          bio: string
          can_view_favorites: boolean
          can_view_gallery: boolean
          can_view_location: boolean
          church: string
          city: string
          desired_places: string[]
          favorite_artists: Json
          favorite_books: Json
          favorite_games: Json
          favorite_movies: Json
          favorite_season: string
          favorite_series: Json
          favorite_songs: Json
          full_name: string
          hobbies: string[]
          interests: string[]
          is_friend: boolean
          personality: string[]
          profile_id: string
          social_energy: string
          state_code: string
          username: string
          visited_places: string[]
          weekend_preferences: string[]
        }[]
      }
      invite_group_members: {
        Args: { p_conversation_id: string; p_member_ids: string[] }
        Returns: {
          conversation_id: string
          created_at: string
          joined_at: string | null
          profile_id: string
          role: Database["public"]["Enums"]["conversation_member_role"]
          status: Database["public"]["Enums"]["conversation_member_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "conversation_members"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      is_report_target_attachment_retained: {
        Args: { p_bucket_id: string; p_object_path: string }
        Returns: boolean
      }
      join_community: {
        Args: { p_community_id: string }
        Returns: {
          community_id: string
          created_at: string
          joined_at: string | null
          profile_id: string
          role: Database["public"]["Enums"]["community_role"]
          status: Database["public"]["Enums"]["community_membership_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "community_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      leave_community: {
        Args: { p_community_id: string }
        Returns: {
          community_id: string
          created_at: string
          joined_at: string | null
          profile_id: string
          role: Database["public"]["Enums"]["community_role"]
          status: Database["public"]["Enums"]["community_membership_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "community_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      leave_group_conversation: {
        Args: { p_conversation_id: string }
        Returns: {
          conversation_id: string
          created_at: string
          joined_at: string | null
          profile_id: string
          role: Database["public"]["Enums"]["conversation_member_role"]
          status: Database["public"]["Enums"]["conversation_member_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "conversation_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      list_account_deletion_reconciliation: {
        Args: { p_limit?: number }
        Returns: {
          content_prepared_at: string | null
          request_id: string
          started_at: string
          storage_object_count: number
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "account_deletion_tombstones"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_account_export_cleanup: {
        Args: { p_limit?: number }
        Returns: {
          bucket_id: string
          byte_size: number
          created_at: string
          expires_at: string
          id: string
          object_path: string
          request_id: string
          sha256: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "account_export_artifacts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_community_branding_cleanup: {
        Args: { p_limit?: number }
        Returns: {
          bucket_id: string
          cleanup_id: string
          cleanup_kind: string
          object_path: string
        }[]
      }
      list_global_role_assignments: {
        Args: {
          p_before_updated_at?: string
          p_before_user_id?: string
          p_limit?: number
          p_query?: string
        }
        Returns: {
          full_name: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
          username: string
        }[]
      }
      list_message_attachment_cleanup: {
        Args: { p_limit?: number }
        Returns: {
          attachment_id: string
          bucket_id: string
          delete_object: boolean
          object_path: string
        }[]
      }
      list_orphan_media_cleanup_reconciliation: {
        Args: { p_limit?: number }
        Returns: {
          bucket_id: string
          object_path: string
        }[]
      }
      list_orphan_media_upload_cleanup: {
        Args: { p_limit?: number }
        Returns: {
          bucket_id: string
          object_path: string
        }[]
      }
      list_own_blocked_profiles: {
        Args: {
          p_before_created_at?: string
          p_before_id?: string
          p_blocked_profile_id?: string
          p_limit?: number
        }
        Returns: {
          avatar_path: string
          block_id: string
          blocked_profile_id: string
          created_at: string
          full_name: string
          username: string
        }[]
      }
      list_post_media_cleanup: {
        Args: { p_limit?: number }
        Returns: {
          bucket_id: string
          byte_size: number
          created_at: string
          height: number | null
          id: string
          mime_type: string
          object_path: string
          owner_id: string
          post_id: string
          sort_order: number
          status: Database["public"]["Enums"]["media_processing_status"]
          updated_at: string
          width: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "post_media"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_profile_media_cleanup: {
        Args: { p_limit?: number }
        Returns: {
          bucket_id: string
          byte_size: number
          created_at: string
          height: number
          id: string
          mime_type: string
          object_path: string
          profile_id: string
          purpose: Database["public"]["Enums"]["profile_media_purpose"]
          sort_order: number
          status: Database["public"]["Enums"]["media_processing_status"]
          updated_at: string
          width: number
        }[]
        SetofOptions: {
          from: "*"
          to: "profile_media"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_report_evidence_cleanup: {
        Args: { p_limit?: number }
        Returns: {
          bucket_id: string
          byte_size: number
          created_at: string
          id: string
          mime_type: string
          object_path: string
          report_id: string
          retention_until: string
          status: Database["public"]["Enums"]["media_processing_status"]
          uploader_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "report_evidence"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_report_target_attachment_cleanup: {
        Args: { p_limit?: number }
        Returns: {
          attachment_id: string
          bucket_id: string
          delete_object: boolean
          object_path: string
        }[]
      }
      list_support_ticket_messages: {
        Args: {
          p_before_created_at?: string
          p_before_id?: string
          p_limit?: number
          p_ticket_id: string
        }
        Returns: {
          body: string
          created_at: string
          id: string
          sender_avatar_path: string
          sender_id: string
          sender_name: string
          ticket_id: string
        }[]
      }
      list_support_tickets: {
        Args: {
          p_before_activity?: string
          p_before_id?: string
          p_limit?: number
          p_status?: Database["public"]["Enums"]["support_ticket_status"]
        }
        Returns: {
          assigned_to: string
          assignee_full_name: string
          category: Database["public"]["Enums"]["support_ticket_category"]
          created_at: string
          id: string
          last_message_at: string
          priority: Database["public"]["Enums"]["support_ticket_priority"]
          requester_avatar_path: string
          requester_full_name: string
          requester_id: string
          resolved_at: string
          status: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          updated_at: string
        }[]
      }
      list_user_storage_objects: {
        Args: { p_user_id: string }
        Returns: {
          bucket_id: string
          object_path: string
        }[]
      }
      mark_message_delivered: {
        Args: { p_message_id: string }
        Returns: {
          delivered_at: string | null
          message_id: string
          profile_id: string
          read_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "message_receipts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_message_read: {
        Args: { p_message_id: string }
        Returns: {
          delivered_at: string | null
          message_id: string
          profile_id: string
          read_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "message_receipts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_notifications_read: {
        Args: { p_notification_ids?: string[] }
        Returns: number
      }
      prepare_account_deletion: {
        Args: { p_request_id: string }
        Returns: Json
      }
      reconcile_expired_profile_restrictions: {
        Args: { p_limit?: number }
        Returns: {
          created_at: string
          profile_id: string
          public_reason: string | null
          restricted_until: string | null
          status: Database["public"]["Enums"]["profile_account_status"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "profile_moderation_state"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      record_account_deletion_completed: {
        Args: {
          p_request_id: string
          p_storage_object_count: number
          p_user_id: string
        }
        Returns: undefined
      }
      record_account_deletion_started: {
        Args: { p_request_id: string; p_storage_object_count: number }
        Returns: string
      }
      record_account_lifecycle_retry: {
        Args: { p_error_code: string; p_request_id: string }
        Returns: {
          cancelled_at: string | null
          completed_at: string | null
          execute_after: string
          id: string
          kind: Database["public"]["Enums"]["account_lifecycle_kind"]
          requested_at: string
          status: Database["public"]["Enums"]["account_lifecycle_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "account_lifecycle_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_community_branding_validation: {
        Args: { p_media_id: string; p_owner_id: string; p_reason_code: string }
        Returns: undefined
      }
      reject_media_validation: {
        Args: {
          p_media_id: string
          p_owner_id: string
          p_reason_code: string
          p_scope: string
        }
        Returns: undefined
      }
      reject_report_evidence_validation: {
        Args: {
          p_evidence_id: string
          p_owner_id: string
          p_reason_code: string
        }
        Returns: undefined
      }
      remove_community_post: {
        Args: { p_post_id: string }
        Returns: {
          author_id: string | null
          body: string
          community_id: string | null
          created_at: string
          id: string
          status: Database["public"]["Enums"]["content_status"]
          updated_at: string
          visibility: Database["public"]["Enums"]["content_visibility"]
        }
        SetofOptions: {
          from: "*"
          to: "community_posts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      remove_friendship: { Args: { friendship_id: string }; Returns: undefined }
      remove_group_member: {
        Args: { p_conversation_id: string; p_profile_id: string }
        Returns: {
          conversation_id: string
          created_at: string
          joined_at: string | null
          profile_id: string
          role: Database["public"]["Enums"]["conversation_member_role"]
          status: Database["public"]["Enums"]["conversation_member_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "conversation_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      remove_post_comment: {
        Args: { p_comment_id: string }
        Returns: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          parent_comment_id: string | null
          post_id: string
          status: Database["public"]["Enums"]["content_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "post_comments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      remove_post_media: {
        Args: { p_media_id: string }
        Returns: {
          bucket_id: string
          byte_size: number
          created_at: string
          height: number | null
          id: string
          mime_type: string
          object_path: string
          owner_id: string
          post_id: string
          sort_order: number
          status: Database["public"]["Enums"]["media_processing_status"]
          updated_at: string
          width: number | null
        }
        SetofOptions: {
          from: "*"
          to: "post_media"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      remove_profile_media: {
        Args: { p_media_id: string }
        Returns: {
          bucket_id: string
          byte_size: number
          created_at: string
          height: number
          id: string
          mime_type: string
          object_path: string
          profile_id: string
          purpose: Database["public"]["Enums"]["profile_media_purpose"]
          sort_order: number
          status: Database["public"]["Enums"]["media_processing_status"]
          updated_at: string
          width: number
        }
        SetofOptions: {
          from: "*"
          to: "profile_media"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reorder_profile_gallery: {
        Args: { p_media_ids: string[] }
        Returns: {
          bucket_id: string
          byte_size: number
          created_at: string
          height: number
          id: string
          mime_type: string
          object_path: string
          profile_id: string
          purpose: Database["public"]["Enums"]["profile_media_purpose"]
          sort_order: number
          status: Database["public"]["Enums"]["media_processing_status"]
          updated_at: string
          width: number
        }[]
        SetofOptions: {
          from: "*"
          to: "profile_media"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      reply_support_ticket: {
        Args: { p_message: string; p_ticket_id: string }
        Returns: {
          body: string
          created_at: string
          id: string
          sender_id: string
          ticket_id: string
        }
        SetofOptions: {
          from: "*"
          to: "support_ticket_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_account_lifecycle: {
        Args: {
          p_confirmation?: string
          p_kind: Database["public"]["Enums"]["account_lifecycle_kind"]
        }
        Returns: {
          cancelled_at: string | null
          completed_at: string | null
          execute_after: string
          id: string
          kind: Database["public"]["Enums"]["account_lifecycle_kind"]
          requested_at: string
          status: Database["public"]["Enums"]["account_lifecycle_status"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "account_lifecycle_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_conversation: {
        Args: { p_opening_message?: string; p_target_profile_id: string }
        Returns: {
          conversation_id: string | null
          created_at: string
          id: string
          opening_message: string | null
          recipient_id: string
          requester_id: string
          responded_at: string | null
          status: Database["public"]["Enums"]["conversation_request_status"]
        }
        SetofOptions: {
          from: "*"
          to: "conversation_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_friendship: {
        Args: { target_user_id: string }
        Returns: {
          accepted_at: string | null
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: Database["public"]["Enums"]["friendship_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "friendships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reserve_community_branding_media: {
        Args: {
          p_byte_size: number
          p_community_id: string
          p_height: number
          p_mime_type: string
          p_object_path: string
          p_purpose: string
          p_width: number
        }
        Returns: {
          bucket_id: string
          byte_size: number
          community_id: string
          created_at: string
          height: number
          id: string
          mime_type: string
          object_path: string
          owner_id: string
          purpose: string
          status: Database["public"]["Enums"]["media_processing_status"]
          updated_at: string
          width: number
        }
        SetofOptions: {
          from: "*"
          to: "community_branding_media"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reserve_post_media: {
        Args: {
          p_byte_size: number
          p_height: number
          p_mime_type: string
          p_object_path: string
          p_post_id: string
          p_sort_order: number
          p_width: number
        }
        Returns: {
          bucket_id: string
          byte_size: number
          created_at: string
          height: number | null
          id: string
          mime_type: string
          object_path: string
          owner_id: string
          post_id: string
          sort_order: number
          status: Database["public"]["Enums"]["media_processing_status"]
          updated_at: string
          width: number | null
        }
        SetofOptions: {
          from: "*"
          to: "post_media"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reserve_profile_media: {
        Args: {
          p_byte_size: number
          p_height: number
          p_mime_type: string
          p_purpose: Database["public"]["Enums"]["profile_media_purpose"]
          p_width: number
        }
        Returns: {
          bucket_id: string
          byte_size: number
          created_at: string
          height: number
          id: string
          mime_type: string
          object_path: string
          profile_id: string
          purpose: Database["public"]["Enums"]["profile_media_purpose"]
          sort_order: number
          status: Database["public"]["Enums"]["media_processing_status"]
          updated_at: string
          width: number
        }
        SetofOptions: {
          from: "*"
          to: "profile_media"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reserve_report_evidence: {
        Args: {
          p_byte_size: number
          p_mime_type: string
          p_object_path: string
          p_report_id: string
        }
        Returns: {
          bucket_id: string
          byte_size: number
          created_at: string
          id: string
          mime_type: string
          object_path: string
          report_id: string
          retention_until: string
          status: Database["public"]["Enums"]["media_processing_status"]
          uploader_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "report_evidence"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_to_community_membership: {
        Args: {
          p_accept: boolean
          p_community_id: string
          p_profile_id: string
        }
        Returns: {
          community_id: string
          created_at: string
          joined_at: string | null
          profile_id: string
          role: Database["public"]["Enums"]["community_role"]
          status: Database["public"]["Enums"]["community_membership_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "community_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_to_conversation_request: {
        Args: { p_accept: boolean; p_request_id: string }
        Returns: {
          conversation_id: string | null
          created_at: string
          id: string
          opening_message: string | null
          recipient_id: string
          requester_id: string
          responded_at: string | null
          status: Database["public"]["Enums"]["conversation_request_status"]
        }
        SetofOptions: {
          from: "*"
          to: "conversation_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_to_friendship: {
        Args: { accept_request: boolean; friendship_id: string }
        Returns: {
          accepted_at: string | null
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: Database["public"]["Enums"]["friendship_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "friendships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_to_group_invitation: {
        Args: { p_accept: boolean; p_conversation_id: string }
        Returns: {
          conversation_id: string
          created_at: string
          joined_at: string | null
          profile_id: string
          role: Database["public"]["Enums"]["conversation_member_role"]
          status: Database["public"]["Enums"]["conversation_member_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "conversation_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_discoverable_interests: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string }
        Returns: {
          interest: string
          profile_count: number
        }[]
      }
      search_discoverable_posts: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string }
        Returns: {
          author_avatar_path: string
          author_id: string
          author_name: string
          author_username: string
          body: string
          comment_count: number
          community_id: string
          community_name: string
          community_slug: string
          created_at: string
          media_count: number
          post_id: string
          reaction_count: number
          viewer_reaction: Database["public"]["Enums"]["reaction_kind"]
        }[]
      }
      search_visible_profiles: {
        Args: { page_offset?: number; page_size?: number; search_term?: string }
        Returns: {
          avatar_path: string
          bio: string
          can_view_favorites: boolean
          can_view_gallery: boolean
          can_view_location: boolean
          church: string
          city: string
          desired_places: string[]
          favorite_artists: Json
          favorite_books: Json
          favorite_games: Json
          favorite_movies: Json
          favorite_season: string
          favorite_series: Json
          favorite_songs: Json
          full_name: string
          hobbies: string[]
          interests: string[]
          is_friend: boolean
          personality: string[]
          profile_id: string
          social_energy: string
          state_code: string
          username: string
          visited_places: string[]
          weekend_preferences: string[]
        }[]
      }
      send_message: {
        Args: {
          p_body?: string
          p_client_message_id?: string
          p_conversation_id: string
          p_kind: Database["public"]["Enums"]["message_kind"]
          p_reply_to_message_id?: string
        }
        Returns: {
          body: string | null
          client_message_id: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          forwarded_from_message_id: string | null
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          reply_to_message_id: string | null
          sender_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_validated_message_media: {
        Args: {
          p_body: string
          p_byte_size: number
          p_client_message_id: string
          p_conversation_id: string
          p_duration_seconds?: number
          p_height?: number
          p_kind: Database["public"]["Enums"]["message_kind"]
          p_mime_type: string
          p_object_path: string
          p_owner_id: string
          p_reply_to_message_id: string
          p_waveform?: Json
          p_width?: number
        }
        Returns: {
          body: string | null
          client_message_id: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          forwarded_from_message_id: string | null
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          reply_to_message_id: string | null
          sender_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_community_member_role: {
        Args: {
          p_community_id: string
          p_profile_id: string
          p_role: Database["public"]["Enums"]["community_role"]
        }
        Returns: {
          community_id: string
          created_at: string
          joined_at: string | null
          profile_id: string
          role: Database["public"]["Enums"]["community_role"]
          status: Database["public"]["Enums"]["community_membership_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "community_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_conversation_favorite: {
        Args: { p_conversation_id: string; p_favorited: boolean }
        Returns: {
          archived_at: string | null
          cleared_before: string | null
          conversation_id: string
          created_at: string
          favorited_at: string | null
          muted_until: string | null
          notifications_enabled: boolean
          profile_id: string
          read_receipts_enabled: boolean
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "conversation_preferences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_group_member_role: {
        Args: {
          p_conversation_id: string
          p_profile_id: string
          p_role: Database["public"]["Enums"]["conversation_member_role"]
        }
        Returns: {
          conversation_id: string
          created_at: string
          joined_at: string | null
          profile_id: string
          role: Database["public"]["Enums"]["conversation_member_role"]
          status: Database["public"]["Enums"]["conversation_member_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "conversation_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_message_reaction: {
        Args: {
          p_active: boolean
          p_kind: Database["public"]["Enums"]["reaction_kind"]
          p_message_id: string
        }
        Returns: boolean
      }
      text_array_payload_is_valid: {
        Args: {
          candidate_values: string[]
          maximum_bytes: number
          maximum_item_characters: number
          maximum_items: number
        }
        Returns: boolean
      }
      transfer_group_ownership: {
        Args: { p_conversation_id: string; p_new_owner_id: string }
        Returns: {
          conversation_id: string
          created_at: string
          joined_at: string | null
          profile_id: string
          role: Database["public"]["Enums"]["conversation_member_role"]
          status: Database["public"]["Enums"]["conversation_member_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "conversation_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      unban_community_member: {
        Args: { p_community_id: string; p_profile_id: string }
        Returns: {
          community_id: string
          created_at: string
          joined_at: string | null
          profile_id: string
          role: Database["public"]["Enums"]["community_role"]
          status: Database["public"]["Enums"]["community_membership_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "community_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      unblock_profile: {
        Args: { p_target_profile_id: string }
        Returns: undefined
      }
      update_community_details: {
        Args: {
          p_avatar_path?: string
          p_category: string
          p_community_id: string
          p_cover_path?: string
          p_description: string
          p_name: string
          p_visibility: Database["public"]["Enums"]["community_visibility"]
        }
        Returns: {
          archived_at: string | null
          avatar_path: string | null
          category: string
          cover_path: string | null
          created_at: string
          description: string
          id: string
          name: string
          owner_id: string | null
          slug: string
          updated_at: string
          visibility: Database["public"]["Enums"]["community_visibility"]
        }
        SetofOptions: {
          from: "*"
          to: "communities"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_own_profile_details: {
        Args: { p_patch: Json }
        Returns: {
          created_at: string
          desired_places: string[]
          favorite_artists: Json
          favorite_books: Json
          favorite_games: Json
          favorite_movies: Json
          favorite_season: string | null
          favorite_series: Json
          favorite_songs: Json
          hobbies: string[]
          interests: string[]
          personality: string[]
          profile_id: string
          social_energy: string | null
          updated_at: string
          visited_places: string[]
          weekend_preferences: string[]
        }
        SetofOptions: {
          from: "*"
          to: "profile_details"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_support_ticket_state: {
        Args: {
          p_priority: Database["public"]["Enums"]["support_ticket_priority"]
          p_status: Database["public"]["Enums"]["support_ticket_status"]
          p_ticket_id: string
        }
        Returns: {
          assigned_to: string | null
          category: Database["public"]["Enums"]["support_ticket_category"]
          created_at: string
          id: string
          last_message_at: string
          priority: Database["public"]["Enums"]["support_ticket_priority"]
          requester_id: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "support_tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_community_rule: {
        Args: {
          p_community_id: string
          p_description: string
          p_rule_id?: string
          p_sort_order: number
          p_title: string
        }
        Returns: {
          community_id: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          sort_order: number
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "community_rules"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      username_is_available: { Args: { candidate: string }; Returns: boolean }
    }
    Enums: {
      account_lifecycle_kind: "data_export" | "deactivate" | "delete"
      account_lifecycle_status:
        | "pending"
        | "processing"
        | "completed"
        | "cancelled"
        | "failed"
      app_role: "super_admin" | "admin" | "moderator" | "support" | "user"
      community_membership_status: "pending" | "active" | "banned" | "left"
      community_role: "owner" | "moderator" | "member"
      community_visibility: "public" | "private"
      content_status: "active" | "hidden" | "removed"
      content_visibility: "public" | "friends" | "community" | "private"
      conversation_kind: "direct" | "group"
      conversation_member_role: "owner" | "admin" | "member"
      conversation_member_status: "invited" | "active" | "left" | "removed"
      conversation_request_status:
        | "pending"
        | "accepted"
        | "declined"
        | "cancelled"
      friendship_status: "pending" | "accepted" | "declined"
      media_processing_status: "pending" | "ready" | "deleting" | "failed"
      message_kind: "text" | "audio" | "image" | "file" | "system"
      moderation_action_type:
        | "warn"
        | "hide_content"
        | "remove_content"
        | "restrict"
        | "suspend"
        | "ban"
        | "dismiss"
      profile_account_status: "active" | "restricted" | "suspended" | "banned"
      profile_media_purpose: "avatar" | "cover" | "gallery"
      profile_visibility: "public" | "friends" | "private"
      reaction_kind: "like" | "love" | "amen" | "pray" | "support"
      report_status: "open" | "in_review" | "resolved" | "dismissed"
      report_target_type:
        | "profile"
        | "community"
        | "community_post"
        | "post_comment"
        | "message"
      support_ticket_category:
        | "account"
        | "access"
        | "security"
        | "privacy"
        | "technical"
        | "other"
      support_ticket_priority: "low" | "normal" | "high" | "urgent"
      support_ticket_status: "open" | "in_progress" | "resolved"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_lifecycle_kind: ["data_export", "deactivate", "delete"],
      account_lifecycle_status: [
        "pending",
        "processing",
        "completed",
        "cancelled",
        "failed",
      ],
      app_role: ["super_admin", "admin", "moderator", "support", "user"],
      community_membership_status: ["pending", "active", "banned", "left"],
      community_role: ["owner", "moderator", "member"],
      community_visibility: ["public", "private"],
      content_status: ["active", "hidden", "removed"],
      content_visibility: ["public", "friends", "community", "private"],
      conversation_kind: ["direct", "group"],
      conversation_member_role: ["owner", "admin", "member"],
      conversation_member_status: ["invited", "active", "left", "removed"],
      conversation_request_status: [
        "pending",
        "accepted",
        "declined",
        "cancelled",
      ],
      friendship_status: ["pending", "accepted", "declined"],
      media_processing_status: ["pending", "ready", "deleting", "failed"],
      message_kind: ["text", "audio", "image", "file", "system"],
      moderation_action_type: [
        "warn",
        "hide_content",
        "remove_content",
        "restrict",
        "suspend",
        "ban",
        "dismiss",
      ],
      profile_account_status: ["active", "restricted", "suspended", "banned"],
      profile_media_purpose: ["avatar", "cover", "gallery"],
      profile_visibility: ["public", "friends", "private"],
      reaction_kind: ["like", "love", "amen", "pray", "support"],
      report_status: ["open", "in_review", "resolved", "dismissed"],
      report_target_type: [
        "profile",
        "community",
        "community_post",
        "post_comment",
        "message",
      ],
      support_ticket_category: [
        "account",
        "access",
        "security",
        "privacy",
        "technical",
        "other",
      ],
      support_ticket_priority: ["low", "normal", "high", "urgent"],
      support_ticket_status: ["open", "in_progress", "resolved"],
    },
  },
} as const
