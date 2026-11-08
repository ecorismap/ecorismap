import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { StorageMigrationDialog } from '../StorageMigrationDialog';
import { t } from '../../../i18n/config';
import {
  exportAsyncStorageData,
  markMigrationExported,
  postponeMigration,
  skipMigration,
} from '../../../utils/storageMigration';

jest.mock('@expo/vector-icons', () => ({
  MaterialIcons: 'View',
}));

// 表示を遅らせる協調機構は素通しにする（StyledDialogのテストで別に確かめる）
jest.mock('../../molecules/StyledDialog', () => ({
  useDialogPresence: (_key: string, visible: boolean) => visible,
}));

jest.mock('../../../utils/storageMigration', () => ({
  exportAsyncStorageData: jest.fn(),
  markMigrationExported: jest.fn(),
  postponeMigration: jest.fn(),
  skipMigration: jest.fn(),
  formatDataSize: () => '4 KB',
}));

const mockExport = exportAsyncStorageData as jest.Mock;

describe('StorageMigrationDialog', () => {
  const renderDialog = async () => {
    const onClose = jest.fn();
    const onMigrationComplete = jest.fn();
    const screen = await render(
      <StorageMigrationDialog
        visible={true}
        storageInfo={{ hasData: true, dataSize: 4096, keys: ['persist:root'] }}
        onClose={onClose}
        onMigrationComplete={onMigrationComplete}
      />
    );
    return { ...screen, onClose, onMigrationComplete };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 確認・完了の表示はカード内で行い、別のダイアログを重ねない
  const alertSpy = jest.spyOn(Alert, 'alert');
  afterEach(() => {
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('「後で確認」は延期を記録し、カード内の案内のOKで閉じる', async () => {
    const { getByText, onClose } = await renderDialog();

    await fireEvent.press(getByText(t('storageMigration.postponeButton')));
    expect(postponeMigration).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(getByText(t('storageMigration.postponeMessage'))).toBeTruthy();

    await fireEvent.press(getByText(t('storageMigration.okButton')));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('「新規として開始」は確認を挟み、キャンセルで元に戻る', async () => {
    const { getByText, onClose } = await renderDialog();

    await fireEvent.press(getByText(t('storageMigration.skipButton')));
    expect(getByText(t('storageMigration.skipConfirmMessage'))).toBeTruthy();

    await fireEvent.press(getByText(t('storageMigration.cancelButton')));
    expect(getByText(t('storageMigration.exportButton'))).toBeTruthy();
    expect(skipMigration).not.toHaveBeenCalled();

    await fireEvent.press(getByText(t('storageMigration.skipButton')));
    await fireEvent.press(getByText(t('storageMigration.skipConfirmButton')));
    expect(skipMigration).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('エクスポートに成功したら、完了表示のOKを待たずに完了を記録する', async () => {
    mockExport.mockResolvedValue('/cache/export/local.ecorismap');
    const { getByText, onClose, onMigrationComplete } = await renderDialog();

    await fireEvent.press(getByText(t('storageMigration.exportButton')));
    await waitFor(() => expect(getByText(t('storageMigration.exportCompleteMessage'))).toBeTruthy());
    expect(markMigrationExported).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    await fireEvent.press(getByText(t('storageMigration.okButton')));
    expect(onMigrationComplete).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('エクスポートに失敗したらエラーを表示し、OKで選択に戻る', async () => {
    mockExport.mockRejectedValue(new Error('disk full'));
    const { getByText, onClose } = await renderDialog();

    await fireEvent.press(getByText(t('storageMigration.exportButton')));
    await waitFor(() => expect(getByText(t('storageMigration.exportError', { error: 'disk full' }))).toBeTruthy());
    expect(markMigrationExported).not.toHaveBeenCalled();

    await fireEvent.press(getByText(t('storageMigration.okButton')));
    expect(getByText(t('storageMigration.exportButton'))).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});
