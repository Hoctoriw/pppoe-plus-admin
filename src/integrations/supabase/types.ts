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
      backup_settings: {
        Row: {
          created_at: string
          email: string
          last_sent_at: string | null
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          last_sent_at?: string | null
          owner_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          last_sent_at?: string | null
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_digit: string | null
          account_number: string | null
          active: boolean
          agency: string | null
          agency_digit: string | null
          api_key: string | null
          bank_code: string | null
          convenio: string | null
          created_at: string
          environment: string
          id: string
          name: string
          owner_id: string
          provider: string
          updated_at: string
          wallet: string | null
        }
        Insert: {
          account_digit?: string | null
          account_number?: string | null
          active?: boolean
          agency?: string | null
          agency_digit?: string | null
          api_key?: string | null
          bank_code?: string | null
          convenio?: string | null
          created_at?: string
          environment?: string
          id?: string
          name: string
          owner_id?: string
          provider?: string
          updated_at?: string
          wallet?: string | null
        }
        Update: {
          account_digit?: string | null
          account_number?: string | null
          active?: boolean
          agency?: string | null
          agency_digit?: string | null
          api_key?: string | null
          bank_code?: string | null
          convenio?: string | null
          created_at?: string
          environment?: string
          id?: string
          name?: string
          owner_id?: string
          provider?: string
          updated_at?: string
          wallet?: string | null
        }
        Relationships: []
      }
      customer_equipment: {
        Row: {
          brand: string | null
          created_at: string
          customer_id: string
          delivered_at: string | null
          equipment_type: string
          id: string
          mac_address: string | null
          model: string | null
          notes: string | null
          owner_id: string
          returned_at: string | null
          serial_number: string | null
          updated_at: string
        }
        Insert: {
          brand?: string | null
          created_at?: string
          customer_id: string
          delivered_at?: string | null
          equipment_type: string
          id?: string
          mac_address?: string | null
          model?: string | null
          notes?: string | null
          owner_id?: string
          returned_at?: string | null
          serial_number?: string | null
          updated_at?: string
        }
        Update: {
          brand?: string | null
          created_at?: string
          customer_id?: string
          delivered_at?: string | null
          equipment_type?: string
          id?: string
          mac_address?: string | null
          model?: string | null
          notes?: string | null
          owner_id?: string
          returned_at?: string | null
          serial_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_equipment_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address_number: string | null
          city: string | null
          created_at: string
          created_by: string
          cto_id: string | null
          cto_port: number | null
          district: string | null
          document: string
          due_day: number | null
          email: string | null
          full_name: string
          id: string
          ipoe_ip: unknown
          last_sync_at: string | null
          latitude: number | null
          longitude: number | null
          mac_address: unknown
          notes: string | null
          owner_id: string
          phone: string
          plan_id: string | null
          postal_code: string | null
          pppoe_password: string | null
          pppoe_username: string | null
          router_id: string | null
          state: string | null
          status: Database["public"]["Enums"]["customer_status"]
          street: string | null
          sync_error: string | null
          sync_status: string
          technology: Database["public"]["Enums"]["access_technology"]
          updated_at: string
        }
        Insert: {
          address_number?: string | null
          city?: string | null
          created_at?: string
          created_by: string
          cto_id?: string | null
          cto_port?: number | null
          district?: string | null
          document: string
          due_day?: number | null
          email?: string | null
          full_name: string
          id?: string
          ipoe_ip?: unknown
          last_sync_at?: string | null
          latitude?: number | null
          longitude?: number | null
          mac_address?: unknown
          notes?: string | null
          owner_id?: string
          phone: string
          plan_id?: string | null
          postal_code?: string | null
          pppoe_password?: string | null
          pppoe_username?: string | null
          router_id?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["customer_status"]
          street?: string | null
          sync_error?: string | null
          sync_status?: string
          technology: Database["public"]["Enums"]["access_technology"]
          updated_at?: string
        }
        Update: {
          address_number?: string | null
          city?: string | null
          created_at?: string
          created_by?: string
          cto_id?: string | null
          cto_port?: number | null
          district?: string | null
          document?: string
          due_day?: number | null
          email?: string | null
          full_name?: string
          id?: string
          ipoe_ip?: unknown
          last_sync_at?: string | null
          latitude?: number | null
          longitude?: number | null
          mac_address?: unknown
          notes?: string | null
          owner_id?: string
          phone?: string
          plan_id?: string | null
          postal_code?: string | null
          pppoe_password?: string | null
          pppoe_username?: string | null
          router_id?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["customer_status"]
          street?: string | null
          sync_error?: string | null
          sync_status?: string
          technology?: Database["public"]["Enums"]["access_technology"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_cto_id_fkey"
            columns: ["cto_id"]
            isOneToOne: false
            referencedRelation: "ftth_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_router_id_fkey"
            columns: ["router_id"]
            isOneToOne: false
            referencedRelation: "routers"
            referencedColumns: ["id"]
          },
        ]
      }
      ftth_nodes: {
        Row: {
          cable_anchors: Json
          cable_fibers: number | null
          cable_length_m: number | null
          connector_count: number
          created_at: string
          fusion_count: number
          id: string
          latitude: number
          longitude: number
          name: string
          node_type: string
          notes: string | null
          owner_id: string
          parent_id: string | null
          parent_leg: string
          pon_port: number | null
          ports: number
          splitter_ratio: number
          splitter_tap: number
          splitter_type: string
          tx_power_dbm: number
          updated_at: string
        }
        Insert: {
          cable_anchors?: Json
          cable_fibers?: number | null
          cable_length_m?: number | null
          connector_count?: number
          created_at?: string
          fusion_count?: number
          id?: string
          latitude: number
          longitude: number
          name: string
          node_type: string
          notes?: string | null
          owner_id?: string
          parent_id?: string | null
          parent_leg?: string
          pon_port?: number | null
          ports?: number
          splitter_ratio?: number
          splitter_tap?: number
          splitter_type?: string
          tx_power_dbm?: number
          updated_at?: string
        }
        Update: {
          cable_anchors?: Json
          cable_fibers?: number | null
          cable_length_m?: number | null
          connector_count?: number
          created_at?: string
          fusion_count?: number
          id?: string
          latitude?: number
          longitude?: number
          name?: string
          node_type?: string
          notes?: string | null
          owner_id?: string
          parent_id?: string | null
          parent_leg?: string
          pon_port?: number | null
          ports?: number
          splitter_ratio?: number
          splitter_tap?: number
          splitter_type?: string
          tx_power_dbm?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ftth_nodes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "ftth_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          bank_account_id: string | null
          barcode: string | null
          boleto_status: string
          boleto_url: string | null
          created_at: string
          created_by: string
          customer_id: string
          due_date: string
          id: string
          linha_digitavel: string | null
          method: string | null
          nosso_numero: string | null
          notes: string | null
          owner_id: string
          paid_at: string | null
          provider_charge_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          barcode?: string | null
          boleto_status?: string
          boleto_url?: string | null
          created_at?: string
          created_by: string
          customer_id: string
          due_date: string
          id?: string
          linha_digitavel?: string | null
          method?: string | null
          nosso_numero?: string | null
          notes?: string | null
          owner_id?: string
          paid_at?: string | null
          provider_charge_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          barcode?: string | null
          boleto_status?: string
          boleto_url?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string
          due_date?: string
          id?: string
          linha_digitavel?: string | null
          method?: string | null
          nosso_numero?: string | null
          notes?: string | null
          owner_id?: string
          paid_at?: string | null
          provider_charge_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      license_payments: {
        Row: {
          amount: number
          created_at: string
          days: number
          id: string
          pix_payload: string | null
          plan_id: string | null
          plan_name: string
          provider_charge_id: string | null
          status: string
          txid: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          days: number
          id?: string
          pix_payload?: string | null
          plan_id?: string | null
          plan_name: string
          provider_charge_id?: string | null
          status?: string
          txid: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          days?: number
          id?: string
          pix_payload?: string | null
          plan_id?: string | null
          plan_name?: string
          provider_charge_id?: string | null
          status?: string
          txid?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "license_payments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "license_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      license_plans: {
        Row: {
          active: boolean
          created_at: string
          days: number
          id: string
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          days: number
          id?: string
          name: string
          price: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          days?: number
          id?: string
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      license_settings: {
        Row: {
          active: boolean
          api_key: string | null
          created_at: string
          environment: string
          id: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          api_key?: string | null
          created_at?: string
          environment?: string
          id?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          api_key?: string | null
          created_at?: string
          environment?: string
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      licenses: {
        Row: {
          created_at: string
          expires_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          created_at: string
          description: string | null
          download_mbps: number
          id: string
          monthly_price: number
          name: string
          owner_id: string
          status: Database["public"]["Enums"]["plan_status"]
          technology: Database["public"]["Enums"]["access_technology"] | null
          updated_at: string
          upload_mbps: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          download_mbps: number
          id?: string
          monthly_price: number
          name: string
          owner_id?: string
          status?: Database["public"]["Enums"]["plan_status"]
          technology?: Database["public"]["Enums"]["access_technology"] | null
          updated_at?: string
          upload_mbps: number
        }
        Update: {
          created_at?: string
          description?: string | null
          download_mbps?: number
          id?: string
          monthly_price?: number
          name?: string
          owner_id?: string
          status?: Database["public"]["Enums"]["plan_status"]
          technology?: Database["public"]["Enums"]["access_technology"] | null
          updated_at?: string
          upload_mbps?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      routers: {
        Row: {
          active: boolean
          base_url: string
          connection_mode: string
          created_at: string
          dhcp_server: string | null
          id: string
          last_check_at: string | null
          last_check_message: string | null
          last_check_ok: boolean | null
          name: string
          owner_id: string
          password: string
          radius_acct_port: number
          radius_auth_port: number
          radius_enabled: boolean
          radius_host: string | null
          radius_secret: string | null
          updated_at: string
          username: string
        }
        Insert: {
          active?: boolean
          base_url: string
          connection_mode?: string
          created_at?: string
          dhcp_server?: string | null
          id?: string
          last_check_at?: string | null
          last_check_message?: string | null
          last_check_ok?: boolean | null
          name: string
          owner_id?: string
          password: string
          radius_acct_port?: number
          radius_auth_port?: number
          radius_enabled?: boolean
          radius_host?: string | null
          radius_secret?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          active?: boolean
          base_url?: string
          connection_mode?: string
          created_at?: string
          dhcp_server?: string | null
          id?: string
          last_check_at?: string | null
          last_check_message?: string | null
          last_check_ok?: boolean | null
          name?: string
          owner_id?: string
          password?: string
          radius_acct_port?: number
          radius_auth_port?: number
          radius_enabled?: boolean
          radius_host?: string | null
          radius_secret?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          owner_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_network: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_team_access: {
        Args: { _owner_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      access_technology: "pppoe" | "ipoe"
      app_role: "admin" | "operator" | "viewer"
      customer_status: "active" | "suspended" | "pending" | "cancelled"
      plan_status: "active" | "inactive"
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
      access_technology: ["pppoe", "ipoe"],
      app_role: ["admin", "operator", "viewer"],
      customer_status: ["active", "suspended", "pending", "cancelled"],
      plan_status: ["active", "inactive"],
    },
  },
} as const
