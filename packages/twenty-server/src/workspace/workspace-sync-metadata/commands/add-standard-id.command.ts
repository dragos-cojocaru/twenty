import { Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';

import { Command, CommandRunner } from 'nest-commander';
import { DataSource } from 'typeorm';

import { ObjectMetadataEntity } from 'src/metadata/object-metadata/object-metadata.entity';
import { FieldMetadataEntity } from 'src/metadata/field-metadata/field-metadata.entity';
import { standardObjectMetadataDefinitions } from 'src/workspace/workspace-sync-metadata/standard-objects';
import { StandardObjectFactory } from 'src/workspace/workspace-sync-metadata/factories/standard-object.factory';
import { computeStandardObject } from 'src/workspace/workspace-sync-metadata/utils/compute-standard-object.util';
import { StandardFieldFactory } from 'src/workspace/workspace-sync-metadata/factories/standard-field.factory';
import { CustomObjectMetadata } from 'src/workspace/workspace-sync-metadata/custom-objects/custom.object-metadata';

@Command({
  name: 'workspace:add-standard-id',
  description: 'Add standard id to all metadata objects and fields',
})
export class AddStandardIdCommand extends CommandRunner {
  private readonly logger = new Logger(AddStandardIdCommand.name);

  constructor(
    @InjectDataSource('metadata')
    private readonly metadataDataSource: DataSource,
    private readonly standardObjectFactory: StandardObjectFactory,
    private readonly standardFieldFactory: StandardFieldFactory,
  ) {
    super();
  }

  async run(): Promise<void> {
    const queryRunner = this.metadataDataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    const manager = queryRunner.manager;

    this.logger.log('Adding standardId to metadata objects and fields');

    try {
      const standardObjectMetadataCollection =
        this.standardObjectFactory.create(
          standardObjectMetadataDefinitions,
          {
            // We don't need to provide the workspace id and data source id as we're only adding standardId
            workspaceId: '',
            dataSourceId: '',
          },
          {
            IS_BLOCKLIST_ENABLED: true,
            IS_CALENDAR_ENABLED: true,
          },
        );
      const standardFieldMetadataCollection = this.standardFieldFactory.create(
        CustomObjectMetadata,
        {
          workspaceId: '',
          dataSourceId: '',
        },
        {
          IS_BLOCKLIST_ENABLED: true,
          IS_CALENDAR_ENABLED: true,
        },
      );

      const objectMetadataRepository =
        manager.getRepository(ObjectMetadataEntity);
      const fieldMetadataRepository =
        manager.getRepository(FieldMetadataEntity);

      /**
       * Update all object metadata with standard id
       */
      const updateObjectMetadataCollection: Partial<ObjectMetadataEntity>[] =
        [];
      const updateFieldMetadataCollection: Partial<FieldMetadataEntity>[] = [];
      const originalObjectMetadataCollection =
        await objectMetadataRepository.find({
          where: {
            fields: { isCustom: false },
          },
          relations: ['fields'],
        });
      const customObjectMetadataCollection =
        originalObjectMetadataCollection.filter(
          (metadata) => metadata.isCustom,
        );
      const standardObjectMetadataMap = new Map(
        standardObjectMetadataCollection.map((metadata) => [
          metadata.nameSingular,
          metadata,
        ]),
      );

      for (const originalObjectMetadata of originalObjectMetadataCollection) {
        const standardObjectMetadata = standardObjectMetadataMap.get(
          originalObjectMetadata.nameSingular,
        );

        if (!standardObjectMetadata && !originalObjectMetadata.isCustom) {
          continue;
        }

        const computedStandardObjectMetadata = computeStandardObject(
          standardObjectMetadata ?? {
            ...originalObjectMetadata,
            fields: standardFieldMetadataCollection,
          },
          originalObjectMetadata,
          customObjectMetadataCollection,
        );

        if (
          !originalObjectMetadata.isCustom &&
          !originalObjectMetadata.standardId
        ) {
          updateObjectMetadataCollection.push({
            id: originalObjectMetadata.id,
            standardId: computedStandardObjectMetadata.standardId,
          });
        }

        for (const fieldMetadata of originalObjectMetadata.fields) {
          const standardFieldMetadata =
            computedStandardObjectMetadata.fields.find(
              (field) => field.name === fieldMetadata.name && !field.isCustom,
            );

          if (!standardFieldMetadata || fieldMetadata.standardId) {
            continue;
          }

          updateFieldMetadataCollection.push({
            id: fieldMetadata.id,
            standardId: standardFieldMetadata.standardId,
          });
        }
      }

      await objectMetadataRepository.save(updateObjectMetadataCollection);

      await fieldMetadataRepository.save(updateFieldMetadataCollection);

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Error adding standard id to metadata', error);
    } finally {
      await queryRunner.release();
    }
  }
}
