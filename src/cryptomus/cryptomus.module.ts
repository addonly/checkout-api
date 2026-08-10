import { Module } from '@nestjs/common';
import { CryptomusSignatureService } from './cryptomus-signature.service';
import { CryptomusClient } from './cryptomus.client';
import { CryptomusService } from './cryptomus.service';

@Module({
  providers: [CryptomusSignatureService, CryptomusClient, CryptomusService],
  exports:   [CryptomusSignatureService, CryptomusClient, CryptomusService],
})
export class CryptomusModule {}
