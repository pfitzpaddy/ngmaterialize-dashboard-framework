/*
 * The MIT License
 *
 * Copyright (c) 2015, Patrick Fitzgerald
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/**
 * @ngdoc directive
 * @name ngm.directive:ngmDashboard
 * @element div
 * @restrict EA
 * @scope
 * @description
 *
 * `ngmDashboard` is a directive which renders the dashboard with all its
 * components. The directive requires a name attribute. The name of the
 * dashboard can be used to store the model.
 *
 * @param {string} name name of the dashboard. This attribute is required.
 * @param {boolean=} editable false to disable the editmode of the dashboard.
 * @param {boolean=} collapsible true to make widgets collapsible on the dashboard.
 * @param {boolean=} maximizable true to add a button for open widgets in a large modal panel.
 * @param {string=} structure the default structure of the dashboard.
 * @param {object=} ngmModel model object of the dashboard.
 * @param {function=} ngmWidgetFilter function to filter widgets on the add dialog.
 */

angular.module('ngm')
	.service('ngmData', ['$q', '$http', function($q, $http){
		return {
			get: function(request){
				var deferred = $q.defer();
				$http(request)
					.success(function(data){
						deferred.resolve(data);
					})
					.error(function(){
						deferred.reject();
					});

				return deferred.promise;
			}
		};
	}])
	.directive('ngmDashboard', ['$rootScope', '$log', '$sce', 'dashboard', 'ngmTemplatePath', function ($rootScope, $log, $sce, dashboard, ngmTemplatePath) {
		'use strict';

		function stringToBoolean(string){
			switch(angular.isDefined(string) ? string.toLowerCase() : null){
				case 'true': case 'yes': case '1': return true;
				case 'false': case 'no': case '0': case null: return false;
				default: return Boolean(string);
			}
		}

		function copyWidgets(source, target) {
			if ( source.widgets && source.widgets.length > 0 ){
				var w = source.widgets.shift();
				while (w){
					target.widgets.push(w);
					w = source.widgets.shift();
				}
			}
		}

		/**
		* Copy widget from old columns to the new model
		* @param object root the model
		* @param array of columns
		* @param counter
		*/
		function fillStructure(root, columns, counter) {
			counter = counter || 0;

			if (angular.isDefined(root.rows)) {
				angular.forEach(root.rows, function (row) {
					angular.forEach(row.columns, function (column) {
						// if the widgets prop doesn't exist, create a new array for it.
						// this allows ui.sortable to do it's thing without error
						if (!column.widgets) {
							column.widgets = [];
						}

						// if a column exist at the counter index, copy over the column
						if (angular.isDefined(columns[counter])) {
							// do not add widgets to a column, which uses nested rows
							if (!angular.isDefined(column.rows)){
								copyWidgets(columns[counter], column);
								counter++;
							}
						}

						// run fillStructure again for any sub rows/columns
						counter = fillStructure(column, columns, counter);
					});
				});
			}
			return counter;
		}

		/**
		* Read Columns: recursively searches an object for the 'columns' property
		* @param object model
		* @param array  an array of existing columns; used when recursion happens
		*/
		function readColumns(root, columns) {
			columns = columns || [];

			if (angular.isDefined(root.rows)) {
				angular.forEach(root.rows, function (row) {
					angular.forEach(row.columns, function (col) {
						columns.push(col);
						// keep reading columns until we can't any more
						readColumns(col, columns);
					});
				});
			}

			return columns;
		}

		function changeStructure(model, structure){
			var columns = readColumns(model);
			var counter = 0;

			model.rows = angular.copy(structure.rows);

			while ( counter < columns.length ){
				counter = fillStructure(model, columns, counter);
			}
		}

		function createConfiguration(type){
			var cfg = {};
			var config = dashboard.widgets[type].config;
			if (config){
				cfg = angular.copy(config);
			}
			return cfg;
		}

		/**
		 * Find first widget column in model.
		 *
		 * @param dashboard model
		 */
		function findFirstWidgetColumn(model){
			var column = null;
			if (!angular.isArray(model.rows)){
				$log.error('model does not have any rows');
				return null;
			}
			for (var i=0; i<model.rows.length; i++){
				var row = model.rows[i];
				if (angular.isArray(row.columns)){
					for (var j=0; j<row.columns.length; j++){
						var col = row.columns[j];
						if (!col.rows){
							column = col;
							break;
						}
					}
				}
				if (column){
					break;
				}
			}
			return column;
		}

		return {
			replace: true,
			restrict: 'EA',
			transclude : false,
			scope: {
				structure: '@',
				name: '@',
				collapsible: '@',
				editable: '@',
				maximizable: '@',
				ngmModel: '=',
				ngmWidgetFilter: '='
			},
			controller: function($scope){
				var model = {};
				var structure = {};
				var widgetFilter = null;
				var structureName = {};
				var name = $scope.name;

				// Update widget configs with broadcast
				// if($scope.ngmModel){
				// 	$scope.ngmModel.updateWidgets = function(params){
				// 		$scope.$broadcast( 'widgetConfigChanged', params );
				// 	}
				// }

				// Watching for changes on ngmModel
				$scope.$watch('ngmModel', function(oldVal, newVal) {
					// has model changed or is the model attribute not set
					if (newVal !== null || (oldVal === null && newVal === null)) {
						model = $scope.ngmModel;
						widgetFilter = $scope.ngmWidgetFilter;
						if ( ! model || ! model.rows ){
							structureName = $scope.structure;
							structure = dashboard.structures[structureName];
							if (structure){
								if (model){
									model.rows = angular.copy(structure).rows;
								} else {
									model = angular.copy(structure);
								}
								model.structure = structureName;
							} else {
								$log.error( 'could not find structure ' + structureName);
							}
						}

						if (model) {
							if (!model.title){
								model.title = 'Dashboard';
							}
							if (!model.titleTemplateUrl) {
								model.titleTemplateUrl = ngmTemplatePath + 'dashboard-title.html';
							}
							$scope.model = model;
						} else {
							$log.error('could not find or create model');
						}
					}
				}, true);

				// edit mode
				$scope.editMode = false;
				$scope.editClass = '';

			},
			link: function ($scope, $element, $attr) {
				// pass options to scope
				var options = {
					name: $attr.name,
					editable: true,
					maximizable: stringToBoolean($attr.maximizable),
					collapsible: stringToBoolean($attr.collapsible)
				};
				if (angular.isDefined($attr.editable)){
					options.editable = stringToBoolean($attr.editable);
				}
				$scope.options = options;
			},
			templateUrl: ngmTemplatePath + 'dashboard.html'
		};
	}])
	// toggles accordian classes for 
	.directive('ngmMenu', function() {

		return {
			
			// Restrict it to be an attribute in this case
			restrict: 'A',
			
			// responsible for registering DOM listeners as well as updating the DOM
			link: function(scope, el, attr) {

				// set initial menu style - has to be a better way?
				setTimeout(function(){

					// For all itmes
					$('.side-menu').find('li').each(function(i, d) {

						// find the row that is active
						if ($(d).attr('class').search('active') > 0) {

							// set list header
							$(d).closest('.bold').attr('class', 'bold active');
							
							// set z-depth-1
							$(d).closest('.bold').find('a').attr('class', 
									$(d).closest('.bold').find('a').attr('class') + ' z-depth-1' );

							// slide down list
							$(d).closest('.collapsible-body').slideDown();
							$(d).closest('.collapsible-body').attr('class',
								$(d).closest('.collapsible-body').attr('class') + ' active');
						}
					});

				}, 0);

				// on element click
				el.bind( 'click', function( $event ) {
					
					// toggle list 
					el.toggleClass('active');
					// toggle list 
					el.find('.collapsible-header').toggleClass('z-depth-1');

					// toggle list rows active
					el.find('.collapsible-body').toggleClass('active');

					// toggle list rows animation
					if (el.find('.collapsible-body').hasClass('active')) {
						el.find('.collapsible-body').slideDown();
					} else {
						el.find('.collapsible-body').slideUp();
					}
					
				});
			}
		};
	})
	.directive('ngmDashboardDownload', ['dashboard', 'ngmData',  function(dashboard, ngmData) {

		// client side download    
		var download = {
	
			// prepare and stream CSV to client      
			'csv': function(request){
				// get data
				ngmData.get(request)
					//
					.then(function(csv){

						// send CSV to client 
						var csvHeader;
						var type = 'data:text/csv;charset=utf-8';

						var el = document.createElement('a');
							el.href = 'data:attachment/csv,' + encodeURIComponent(csv.data);
							el.target = '_blank';
							el.download = request.data.report + '.csv';

						// append, download & remove
						document.body.appendChild(el);
						el.click();
						el.remove();

						// close loading mask
						$('#ngm-loading-modal').closeModal();

					},function(data){
						// close loading mask
						$('#ngm-loading-modal').closeModal();
						// error msg						
						Materialize.toast(data.error, 4000);
					});			
			},

			// client side PDF generation
			'pdf': function(request){
				// get data
				ngmData.get(request)
					//
					.then(function(response){
						// close loading mask
						$('#ngm-loading-modal').closeModal();
						// open in new tab
						window.open(request.data.downloadUrl + response.report, '_blank');
					},function(data){
						// close loading mask
						$('#ngm-loading-modal').closeModal();
						// error msg						
						Materialize.toast(data.error, 4000);
					});
			},

			// writes metrics to rest api
			'setMetrics': function(request){
				ngmData.get(request)
					.then(function(data){
					});
			}

		}

		return {
			
			// element or attrbute
			restrict: 'EA',

			replace: true,

			template: '<li><a class="btn-floating {{ color }} z-depth-2 tooltipped" data-position="bottom" data-delay="50" data-tooltip="{{ hover }}"><i class="material-icons">{{ icon }}</i></a></li>',

			scope: {
				type: '=',
				icon: '=',
				color: '=',
				hover: '=',
				url: '=',
				request: '=',
				metrics: '='
			},

			// onclick
			link: function(scope, el, attr) {

				// init tooltip
				$('.tooltipped').tooltip({
					tooltip: 'Download CSV'
				});

				// set defaults
				scope.type = scope.type ? scope.type : 'csv';
				scope.icon = scope.icon ? scope.icon : 'cloud_download';
				scope.color = scope.color ? scope.color : 'blue';
				scope.hover = scope.hover ? scope.hover : 'Download ' + scope.type.toUpperCase();
				
				// bind download event
				el.bind( 'click', function($e) {

					// if simple download url exists
					if(scope.url){

						window.open(scope.url, '_blank');

					// else download process
					} else {
						// open loading mask
						$('#ngm-loading-modal').openModal({dismissible: false});

						// prepare download
						download[scope.type](scope.request);

						// record metrics
						if (scope.metrics) {
							download.setMetrics(scope.metrics);
						}
					}

				});

			}
		}
	}])
	.directive("ngModel", ["$timeout", function($timeout){
		return {
			restrict: 'A',
			priority: -1, // lower priority than built-in ng-model so it runs first
			link: function(scope, element, attr) {
				scope.$watch(attr.ngModel,function(value){
					$timeout(function () {
						if (value){
								element.trigger("change");
						} else if(element.attr('placeholder') === undefined) {
							if(!element.is(":focus")) {
								element.trigger("blur");
							}
						}
					});
				});
			}
		};
	}])
	/**
	 * Add pickadate directive
	 * Type text is mandatory
	 * Example:
	 <input input-date
			type="text"
			name="created"
			id="inputCreated"
			ng-model="currentTime"
			format="dd/mm/yyyy"
			months-full="{{ monthFr }}"
			months-short="{{ monthShortFr }}"
			weekdays-full="{{ weekdaysFullFr }}"
			weekdays-short="{{ weekdaysShortFr }}"
			weekdays-letter="{{ weekdaysLetterFr }}"
			disable="disable"
			today="today"
			clear="clear"
			close="close"
			on-start="onStart()"
			on-render="onRender()"
			on-open="onOpen()"
			on-close="onClose()"
			on-set="onSet()"
			on-stop="onStop()" />
	 */
	 // source
	 // https://github.com/krescruz/angular-materialize/
	.directive('ngmDate', ['$compile', '$timeout', function ($compile, $timeout) { 

		return {
			require: 'ngModel',
			scope: {
					container: "@",
					format: "@",
					formatSubmit: "@",
					monthsFull: "@",
					monthsShort: "@",
					weekdaysFull: "@",
					weekdaysLetter: "@",
					firstDay: "=",
					disable: "=",
					today: "=",
					clear: "=",
					close: "=",
					selectYears: "=",
					onStart: "&",
					onRender: "&",
					onOpen: "&",
					onClose: "&",
					onSet: "&",
					onStop: "&",
					onSelection: "&",
					ngReadonly: "=?",
					max: "@",
					min: "@"
			},
			link: function ($scope, element, attrs, ngModel) {

				// watch changes
				$scope.$watch(function () {
					return ngModel.$modelValue;
				}, function(newValue, oldValue) {
					if(angular.equals(newValue, oldValue)){
						return; // simply skip that
					} else {
						if(angular.isDefined($scope.onSelection)){
							$scope.onSelection();
						}
					}
				});

				// set element
				$scope.$input = element.pickadate({
			    selectMonths: true,
			    selectYears: 15,
			    format: (angular.isDefined($scope.format)) ? $scope.format : 'dd mmm, yyyy',
					min: (angular.isDefined($scope.min)) ? $scope.min : undefined,
					max: (angular.isDefined($scope.max)) ? $scope.max : undefined,			    
					onStart: function(){
						$timeout(function(){
							// set time
							var date = ngModel.$modelValue;
							$scope.picker.set('select', [new Date(date).getFullYear(), new Date(date).getMonth(), new Date(date).getDate()])
						}, 10)
					},			    
					onSet: function(event){
						// close on date select
						if(event.select){
							$scope.picker.close();
						}
					}
			  });
				
				//pickadate API
				$scope.picker = $scope.$input.pickadate('picker');

				// open on click
				element.bind('click', function($e) {
					$scope.picker.open();
				});

			}
		};
	}]);
