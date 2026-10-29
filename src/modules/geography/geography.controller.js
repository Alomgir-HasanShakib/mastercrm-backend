/**
 * @file geography.controller.js
 * @description HTTP Controller handling Geography hierarchy tree retrieval, dependent AC lists, state/PC/SEP lookups, and Excel imports.
 */

const { success } = require('../../utils/response');
const { ValidationError } = require('../../utils/errors');
const geographyService = require('./geography.service');

const geographyController = {
  /**
   * Retrieve structured hierarchy tree (State -> PC -> AC -> SEP/Booth)
   * @route GET /api/v1/geography/tree
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getHierarchyTree(req, res, next) {
    try {
      const treeData = await geographyService.getHierarchyTree(req.query);
      return success(res, treeData, 'Geography hierarchy tree retrieved successfully', 200);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Get list of ACs dependent on specified PC or State
   * @route GET /api/v1/geography/acs
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getDependentAcs(req, res, next) {
    try {
      const acs = await geographyService.getDependentAcs(req.query);
      return success(res, acs, 'Dependent ACs retrieved successfully', 200);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Get list of States
   * @route GET /api/v1/geography/states
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getStates(req, res, next) {
    try {
      const states = await geographyService.getStates(req.query.versionId);
      return success(res, states, 'States retrieved successfully', 200);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Get list of Parliamentary Constituencies for a State
   * @route GET /api/v1/geography/pcs
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getPcs(req, res, next) {
    try {
      const pcs = await geographyService.getPcsByState(req.query.stateCode, req.query.versionId);
      return success(res, pcs, 'PCs retrieved successfully', 200);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Get list of SEPs / Polling Booths under an AC
   * @route GET /api/v1/geography/seps
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async getSeps(req, res, next) {
    try {
      const seps = await geographyService.getSepsByAc(req.query.acCode, req.query.versionId);
      return success(res, seps, 'SEPs / Booths retrieved successfully', 200);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * List geography versions
   * @route GET /api/v1/geography/versions
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async listVersions(req, res, next) {
    try {
      const versions = await geographyService.listVersions(req.query);
      return success(res, versions, 'Geography versions retrieved successfully', 200);
    } catch (err) {
      return next(err);
    }
  },

  /**
   * Import geography Excel / CSV file into a new version
   * @route POST /api/v1/geography/import
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async importExcel(req, res, next) {
    try {
      if (!req.file) {
        throw new ValidationError('No Excel file uploaded. Please upload a .xlsx, .xls, or .csv file');
      }

      const metadata = {
        ...req.body,
        fileName: req.file.originalname,
      };

      const userId = req.user ? req.user.userId : null;
      const result = await geographyService.importGeographyExcel(req.file.buffer, metadata, userId);

      return success(res, result, 'Geography hierarchy imported successfully from Excel', 201);
    } catch (err) {
      return next(err);
    }
  },
};

module.exports = geographyController;
