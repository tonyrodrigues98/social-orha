import {
  legalPublicConfigurationFromEnvironment,
  type LegalPublicEnvironment,
} from "@/config/legal-public-configuration";

const publicLegalEnvironment: LegalPublicEnvironment = {
  VITE_ORHA_LEGAL_OPERATOR_NAME: import.meta.env.VITE_ORHA_LEGAL_OPERATOR_NAME,
  VITE_ORHA_LEGAL_CONTROLLER_NAME:
    import.meta.env.VITE_ORHA_LEGAL_CONTROLLER_NAME,
  VITE_ORHA_LEGAL_ADDRESS: import.meta.env.VITE_ORHA_LEGAL_ADDRESS,
  VITE_ORHA_LEGAL_FORUM: import.meta.env.VITE_ORHA_LEGAL_FORUM,
  VITE_ORHA_LEGAL_EFFECTIVE_DATE:
    import.meta.env.VITE_ORHA_LEGAL_EFFECTIVE_DATE,
  VITE_ORHA_SUPPORT_EMAIL: import.meta.env.VITE_ORHA_SUPPORT_EMAIL,
  VITE_ORHA_PRIVACY_EMAIL: import.meta.env.VITE_ORHA_PRIVACY_EMAIL,
};

export const appLegalConfiguration =
  legalPublicConfigurationFromEnvironment(publicLegalEnvironment);
