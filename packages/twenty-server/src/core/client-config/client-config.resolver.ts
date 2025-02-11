import { Resolver, Query } from '@nestjs/graphql';

import { EnvironmentService } from 'src/integrations/environment/environment.service';

import { ClientConfig } from './client-config.entity';

@Resolver()
export class ClientConfigResolver {
  constructor(private environmentService: EnvironmentService) {}

  @Query(() => ClientConfig)
  async clientConfig(): Promise<ClientConfig> {
    const clientConfig: ClientConfig = {
      authProviders: {
        google: this.environmentService.get('AUTH_GOOGLE_ENABLED'),
        magicLink: false,
        password: true,
      },
      telemetry: {
        enabled: this.environmentService.get('TELEMETRY_ENABLED'),
        anonymizationEnabled: this.environmentService.get(
          'TELEMETRY_ANONYMIZATION_ENABLED',
        ),
      },
      billing: {
        isBillingEnabled: this.environmentService.get('IS_BILLING_ENABLED'),
        billingUrl: this.environmentService.get('BILLING_PLAN_REQUIRED_LINK'),
        billingFreeTrialDurationInDays: this.environmentService.get(
          'BILLING_FREE_TRIAL_DURATION_IN_DAYS',
        ),
      },
      signInPrefilled: this.environmentService.get('SIGN_IN_PREFILLED'),
      signUpDisabled: this.environmentService.get('IS_SIGN_UP_DISABLED'),
      debugMode: this.environmentService.get('DEBUG_MODE'),
      support: {
        supportDriver: this.environmentService.get('SUPPORT_DRIVER'),
        supportFrontChatId: this.environmentService.get(
          'SUPPORT_FRONT_CHAT_ID',
        ),
      },
      sentry: {
        dsn: this.environmentService.get('SENTRY_DSN'),
      },
    };

    return Promise.resolve(clientConfig);
  }
}
